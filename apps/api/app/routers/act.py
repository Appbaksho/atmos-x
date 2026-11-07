"""Actions, reviews, trees, check-ins, stats, avatar and device import (prompt-v1 §9 'Actions and trees')."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select

from ..deps import DB, FullUser
from ..errors import AppError, not_found
from ..media import photo_url
from ..models import Action, Goal, TeamMember, Tree, TreeHelper
from ..services import actions as A
from ..services import goals as G
from ..services import imports as IM
from ..services import stats as ST
from ..services import trees as T
from ..services.notify import notify
from ..services.photos import MAX_BYTES, ingest

router = APIRouter(tags=["act"])

MILESTONES = (25, 50, 75, 100)


async def _read(f: UploadFile | None) -> tuple[bytes, str] | None:
    if f is None or not f.filename and not f.size:
        return None
    data = await f.read(MAX_BYTES + 1)
    if not data:
        return None
    return data, f.content_type or "application/octet-stream"


def _dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        raise AppError(400, "action.taken_at", "Send the time as ISO 8601")
    return d if d.tzinfo else d.replace(tzinfo=UTC)


def _uuid(s: str | None, code: str) -> uuid.UUID | None:
    if not s:
        return None
    try:
        return uuid.UUID(s)
    except ValueError:
        raise AppError(400, code, "Not a valid id")


# ─────────────────────────── actions ───────────────────────────


@router.post("/actions", operation_id="actions_log")
async def log_action(
    db: DB,
    user: FullUser,
    action_type: Annotated[str, Form(max_length=24)],
    quantity: Annotated[float, Form(gt=0, le=10000)],
    capture_source: Annotated[str, Form(pattern="^(camera|upload)$")] = "upload",
    lat: Annotated[float | None, Form(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Form(ge=-180, le=180)] = None,
    accuracy_m: Annotated[float | None, Form(ge=0)] = None,
    taken_at: Annotated[str | None, Form(max_length=40)] = None,
    goal_id: Annotated[str | None, Form(max_length=40)] = None,
    team_id: Annotated[str | None, Form(max_length=40)] = None,
    species_id: Annotated[str | None, Form(max_length=40)] = None,
    nickname: Annotated[str | None, Form(max_length=60)] = None,
    note: Annotated[str | None, Form(max_length=500)] = None,
    client_id: Annotated[str | None, Form(max_length=64)] = None,
    device_id: Annotated[str | None, Form(max_length=64)] = None,
    photo: Annotated[UploadFile | None, File()] = None,
) -> dict:
    gid = _uuid(goal_id, "goal.id")
    before = None
    goal = await db.get(Goal, gid) if gid else None
    if goal is not None and await G.can_view(db, goal, user):
        before = (await G.progress(db, goal))["pct"]
    raw = await _read(photo)
    p = await ingest(db, user.id, raw[0], raw[1], "action") if raw else None
    a, trees = await A.log(
        db,
        user,
        action_type=action_type,
        quantity=quantity,
        lat=lat,
        lng=lng,
        accuracy_m=accuracy_m,
        taken_at=_dt(taken_at),
        capture_source=capture_source,
        photo=p,
        goal_id=gid,
        team_id=_uuid(team_id, "team.id"),
        species_id=species_id,
        nickname=nickname,
        note=note,
        client_id=client_id,
        device_id=device_id,
    )
    crossed: list[int] = []
    if goal is not None and before is not None:
        await db.refresh(goal)
        after = (await G.progress(db, goal))["pct"]
        crossed = [m for m in MILESTONES if before < m <= after]
        for m in crossed:
            await notify(
                db,
                user.id,
                "goal_progress",
                {"code": "notif.goal.milestone", "params": {"pct": m, "zone": goal.zone_name or ""}},
                screen="S10",
                params={"goal_id": str(goal.id)},
                dedupe_key=f"goal:{goal.id}:{m}",
            )
        await db.commit()
    return {
        "log": await A.action_out(db, a, user),
        "trees": [await T.tree_out(db, t, user) for t in trees],
        "milestones": crossed,
    }


@router.get("/actions/mine", operation_id="actions_mine")
async def my_actions(
    db: DB,
    user: FullUser,
    limit: int = Query(50, ge=1, le=200),
    status: str | None = Query(None, pattern="^(pending|verified|rejected)$"),
) -> list[dict]:
    q = select(Action).where(Action.user_id == user.id)
    if status:
        q = q.where(Action.status == status)
    rows = (await db.execute(q.order_by(Action.created_at.desc()).limit(limit))).scalars().all()
    return [await A.action_out(db, a, user) for a in rows]


@router.get("/actions/review-queue", operation_id="actions_review_queue")
async def review_queue(db: DB, user: FullUser, limit: int = Query(30, ge=1, le=100)) -> list[dict]:
    """Pending actions this person may confirm: teammates' (shared team) or, for moderators, everyone's."""
    q = select(Action).where(Action.status == "pending", Action.user_id != user.id)
    if user.role not in ("moderator", "admin"):
        mine = select(TeamMember.team_id).where(TeamMember.user_id == user.id)
        mates = select(TeamMember.user_id).where(TeamMember.team_id.in_(mine))
        q = q.where(Action.user_id.in_(mates))
    rows = (await db.execute(q.order_by(Action.created_at.asc()).limit(limit * 2))).scalars().all()
    out = []
    for a in rows:
        if await A.can_review(db, a, user):
            out.append(await A.action_out(db, a, user))
        if len(out) >= limit:
            break
    return out


async def _visible_action(db: DB, action_id: uuid.UUID, user) -> Action:
    a = await db.get(Action, action_id)
    if a is None:
        raise not_found("action.not_found", "Action not found")
    if a.user_id != user.id and not await A.can_review(db, a, user):
        teams = await A._team_ids(db, user.id)
        if not (a.team_id and a.team_id in teams) and user.role not in ("moderator", "admin"):
            raise not_found("action.not_found", "Action not found")
    return a


@router.get("/actions/{action_id}", operation_id="actions_get")
async def get_action(action_id: uuid.UUID, db: DB, user: FullUser) -> dict:
    return await A.action_out(db, await _visible_action(db, action_id, user), user)


class ReviewIn(BaseModel):
    approve: bool
    note: str | None = Field(default=None, max_length=280)


@router.post("/actions/{action_id}/review", operation_id="actions_review")
async def review_action(action_id: uuid.UUID, body: ReviewIn, db: DB, user: FullUser) -> dict:
    a = await db.get(Action, action_id)
    if a is None:
        raise not_found("action.not_found", "Action not found")
    a = await A.review(db, a, user, body.approve, body.note)
    return await A.action_out(db, a, user)


# ─────────────────────────── trees ───────────────────────────


@router.get("/trees/mine", operation_id="trees_mine")
async def my_trees(db: DB, user: FullUser) -> list[dict]:
    rows = (
        (
            await db.execute(
                select(Tree).where(Tree.user_id == user.id, Tree.revoked.is_(False)).order_by(Tree.next_due_at.asc())
            )
        )
        .scalars()
        .all()
    )
    return [await T.tree_out(db, t, user) for t in rows]


@router.get("/trees/helping", operation_id="trees_helping")
async def helping(db: DB, user: FullUser) -> list[dict]:
    rows = (
        (
            await db.execute(
                select(Tree)
                .join(TreeHelper, TreeHelper.tree_id == Tree.id)
                .where(TreeHelper.user_id == user.id, Tree.revoked.is_(False))
            )
        )
        .scalars()
        .all()
    )
    return [await T.tree_out(db, t, user) for t in rows]


@router.post("/trees", operation_id="trees_add")
async def add_tree(
    db: DB,
    user: FullUser,
    species_id: Annotated[str, Form(max_length=40)],
    nickname: Annotated[str, Form(max_length=60)] = "",
    planted_at: Annotated[str | None, Form(max_length=40)] = None,
    lat: Annotated[float | None, Form(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Form(ge=-180, le=180)] = None,
    client_id: Annotated[str | None, Form(max_length=64)] = None,
    photo: Annotated[UploadFile | None, File()] = None,
) -> dict:
    """Track a tree by hand (no planting action, so no planting points; check-ins still build its timeline)."""
    raw = await _read(photo)
    p = await ingest(db, user.id, raw[0], raw[1], "tree_check") if raw else None
    planted = _dt(planted_at) or datetime.now(UTC)
    if planted > datetime.now(UTC):
        raise AppError(400, "tree.planted_future", "The planting date can't be in the future")
    t = await T.add_manual(
        db,
        user,
        species_id=species_id,
        nickname=nickname,
        planted_at=planted,
        lat=lat,
        lng=lng,
        photo=p,
        client_id=client_id,
    )
    return await T.tree_out(db, t, user, with_checks=True)


@router.get("/trees/{tree_id}", operation_id="trees_get")
async def get_tree(tree_id: uuid.UUID, db: DB, user: FullUser) -> dict:
    t = await T.get_owned(db, tree_id, user)
    return await T.tree_out(db, t, user, with_checks=True)


class TreePatch(BaseModel):
    nickname: str | None = Field(default=None, max_length=60)
    species_id: str | None = Field(default=None, max_length=40)
    lost_confirmed: bool | None = None


@router.patch("/trees/{tree_id}", operation_id="trees_patch")
async def patch_tree(tree_id: uuid.UUID, body: TreePatch, db: DB, user: FullUser) -> dict:
    t = await T.get_owned(db, tree_id, user, edit=True)
    t = await T.patch(db, t, nickname=body.nickname, species_id=body.species_id, lost_confirmed=body.lost_confirmed)
    return await T.tree_out(db, t, user, with_checks=True)


@router.delete("/trees/{tree_id}", operation_id="trees_delete", status_code=204)
async def delete_tree(tree_id: uuid.UUID, db: DB, user: FullUser) -> None:
    t = await T.get_owned(db, tree_id, user, edit=True)
    await T.delete(db, t)


@router.post("/trees/{tree_id}/checks", operation_id="trees_check_in")
async def check_in(
    tree_id: uuid.UUID,
    db: DB,
    user: FullUser,
    health: Annotated[str, Form(pattern="^(healthy|stressed|dead)$")],
    height_cm: Annotated[float | None, Form(ge=0, le=10000)] = None,
    note: Annotated[str | None, Form(max_length=500)] = None,
    lat: Annotated[float | None, Form(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Form(ge=-180, le=180)] = None,
    photo: Annotated[UploadFile | None, File()] = None,
) -> dict:
    t = await T.get_owned(db, tree_id, user)
    raw = await _read(photo)
    p = await ingest(db, user.id, raw[0], raw[1], "tree_check") if raw else None
    c = await T.check_in(db, user, t, photo=p, health=health, height_cm=height_cm, note=note, lat=lat, lng=lng)
    await db.refresh(t)
    out = await T.tree_out(db, t, user, with_checks=True)
    out["check"] = next((x for x in out["checks"] if x["id"] == str(c.id)), None)
    return out


@router.post("/trees/{tree_id}/invite", operation_id="trees_invite")
async def invite(tree_id: uuid.UUID, db: DB, user: FullUser) -> dict:
    t = await T.get_owned(db, tree_id, user, edit=True)
    return T.make_invite(t, user)


class AcceptIn(BaseModel):
    token: str = Field(max_length=2048)


@router.post("/trees/invites/accept", operation_id="trees_invite_accept")
async def accept(body: AcceptIn, db: DB, user: FullUser) -> dict:
    t = await T.accept_invite(db, user, body.token)
    return await T.tree_out(db, t, user, with_checks=True)


# ─────────────────────────── me ───────────────────────────


@router.get("/me/stats", operation_id="me_stats")
async def my_stats(db: DB, user: FullUser) -> dict:
    return await ST.stats(db, user)


@router.post("/me/avatar", operation_id="me_avatar")
async def avatar(db: DB, user: FullUser, photo: Annotated[UploadFile, File()]) -> dict:
    raw = await _read(photo)
    if raw is None:
        raise AppError(400, "photo.missing", "Choose a photo")
    p = await ingest(db, user.id, raw[0], raw[1], "avatar")
    user.avatar_photo_id = p.id
    await db.commit()
    return {"avatar_url": photo_url(p.id, "thumb"), "moderation": p.moderation}


@router.delete("/me/avatar", operation_id="me_avatar_delete", status_code=204)
async def avatar_delete(db: DB, user: FullUser) -> None:
    user.avatar_photo_id = None
    await db.commit()


@router.post("/me/import", operation_id="me_import")
async def device_import(
    request: Request,
    db: DB,
    user: FullUser,
    payload: Annotated[str, Form(max_length=2_000_000)],
    lang: Annotated[str, Form(max_length=5)] = "en",
) -> dict:
    """A9. `payload` is JSON ({goals, trees, actions, checks, fields}); photos are files named `photo:<key>`."""
    try:
        data = IM.ImportIn.model_validate(json.loads(payload))
    except (ValueError, ValidationError) as e:
        raise AppError(400, "import.invalid", "The import file is not valid", fields={"payload": str(e)[:200]})
    form = await request.form()
    photos: dict[str, tuple[bytes, str]] = {}
    for name, val in form.multi_items():
        if name.startswith("photo:") and hasattr(val, "read"):
            raw = await _read(val)  # type: ignore[arg-type]
            if raw:
                photos[name.removeprefix("photo:")] = raw
    return await IM.run(db, user, data, photos, lang=lang)
