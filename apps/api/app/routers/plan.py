"""Goals, plan, reference (prompt-v1 §9 'Goals, plan, reference')."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..deps import DB, FullUser, SessionUser
from ..errors import forbidden, not_found
from ..models import ActionType, GoalTask, ScanZone, Species
from ..schemas.common import lang_or_en
from ..services import goals as G
from ..services import nurseries as N
from ..services import plan as P
from ..services.scan import get_zone_row

router = APIRouter(tags=["plan"])


class GoalIn(BaseModel):
    zone_id: str = Field(max_length=24)
    target_c: float = Field(ge=-5, le=-0.05)
    by_date: date
    team_id: uuid.UUID | None = None
    client_id: str | None = Field(default=None, max_length=64)
    lang: str = "en"


class GoalPatch(BaseModel):
    target_c: float | None = Field(default=None, ge=-5, le=-0.05)
    by_date: date | None = None
    team_id: uuid.UUID | None = None
    status: str | None = Field(default=None, pattern="^(active|done|archived)$")


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    action_type: str | None = None
    qty: float | None = Field(default=None, ge=0)
    owner_id: uuid.UUID | None = None
    due: date | None = None


class TaskPatch(BaseModel):
    status: str | None = Field(default=None, pattern="^(todo|doing|done)$")
    owner_id: uuid.UUID | None = None
    due: date | None = None


class DraftIn(BaseModel):
    payload: dict


@router.post("/goals", operation_id="goals_create")
async def create_goal(body: GoalIn, db: DB, user: FullUser) -> dict:
    g = await G.create(
        db,
        user,
        zone_id=body.zone_id,
        target_c=body.target_c,
        by_date=body.by_date,
        team_id=body.team_id,
        lang=lang_or_en(body.lang),
        client_id=body.client_id,
    )
    return await G.goal_out(db, g)


@router.get("/goals/mine", operation_id="goals_mine")
async def my_goals(db: DB, user: SessionUser) -> list[dict]:
    if user.role == "guest":
        return []
    return [await G.goal_out(db, g) for g in await G.mine(db, user)]


@router.get("/goals/{goal_id}", operation_id="goal_get")
async def get_goal(goal_id: uuid.UUID, db: DB, user: FullUser) -> dict:
    return await G.goal_out(db, await G.get_visible(db, goal_id, user))


@router.patch("/goals/{goal_id}", operation_id="goal_patch")
async def patch_goal(goal_id: uuid.UUID, body: GoalPatch, db: DB, user: FullUser) -> dict:
    g = await G.get_visible(db, goal_id, user)
    if not await G.can_edit(db, g, user):
        raise forbidden("goal.not_owner", "Only the owner or team lead can change this goal")
    data = body.model_dump(exclude_unset=True)
    for k in ("target_c", "by_date", "status"):
        if data.get(k) is not None:
            setattr(g, k, data[k])
    if "team_id" in data:
        g.team_id = data["team_id"]
    if "target_c" in data or "by_date" in data:
        z = await db.get(ScanZone, g.zone_id)
        if z:
            f = await P.feasibility_for(db, z, g.target_c, g.by_date)
            g.kind = f["kind"]
            g.targets = {
                **(g.targets or {}),
                "trees": f["mix"]["trees"],
                "roof_m2": f["mix"]["roof_m2"],
                "shade": f["mix"]["shade"],
            }
    await db.commit()
    return await G.goal_out(db, g)


@router.delete("/goals/{goal_id}", operation_id="goal_delete")
async def delete_goal(goal_id: uuid.UUID, db: DB, user: FullUser) -> dict:
    g = await G.get_visible(db, goal_id, user)
    if not await G.can_edit(db, g, user):
        raise forbidden("goal.not_owner", "Only the owner or team lead can delete this goal")
    g.status = "deleted"
    await db.commit()
    return {"ok": True}


@router.get("/goals/{goal_id}/tasks", operation_id="goal_tasks")
async def tasks(goal_id: uuid.UUID, db: DB, user: FullUser) -> list[dict]:
    await G.get_visible(db, goal_id, user)
    rows = (
        (
            await db.execute(
                select(GoalTask).where(GoalTask.goal_id == goal_id).order_by(GoalTask.position, GoalTask.created_at)
            )
        )
        .scalars()
        .all()
    )
    return [G.task_out(t) for t in rows]


@router.post("/goals/{goal_id}/tasks", operation_id="goal_task_add")
async def add_task(goal_id: uuid.UUID, body: TaskIn, db: DB, user: FullUser) -> dict:
    await G.get_visible(db, goal_id, user)
    t = GoalTask(
        goal_id=goal_id,
        title={"code": "task.custom", "params": {"text": body.title}},
        action_type=body.action_type,
        qty=body.qty,
        owner_id=body.owner_id or user.id,
        due_date=body.due,
        position=99,
    )
    db.add(t)
    await db.commit()
    return G.task_out(t)


@router.patch("/goals/{goal_id}/tasks/{task_id}", operation_id="goal_task_patch")
async def patch_task(goal_id: uuid.UUID, task_id: uuid.UUID, body: TaskPatch, db: DB, user: FullUser) -> dict:
    await G.get_visible(db, goal_id, user)
    t = await db.get(GoalTask, task_id)
    if t is None or t.goal_id != goal_id:
        raise not_found("task.not_found", "Task not found")
    data = body.model_dump(exclude_unset=True)
    if data.get("status"):
        t.status = data["status"]
    if "owner_id" in data:
        t.owner_id = data["owner_id"]
    if "due" in data:
        t.due_date = data["due"]
    await db.commit()
    return G.task_out(t)


@router.post("/goal-drafts", operation_id="goal_draft_save")
async def save_draft(body: DraftIn, db: DB, user: SessionUser) -> dict:
    """Guests may draft a goal (G5); the draft stays on the same user when they sign up."""
    d = await G.save_draft(db, user, body.payload)
    return {"id": str(d.id), "payload": d.payload, "created_at": d.created_at.isoformat()}


@router.get("/goal-drafts", operation_id="goal_draft_latest")
async def latest_draft(db: DB, user: SessionUser) -> dict | None:
    d = await G.latest_draft(db, user)
    return {"id": str(d.id), "payload": d.payload, "created_at": d.created_at.isoformat()} if d else None


@router.get("/goals/{goal_id}/feasibility", operation_id="goal_feasibility")
async def goal_feasibility(goal_id: uuid.UUID, db: DB, user: FullUser) -> dict:
    g = await G.get_visible(db, goal_id, user)
    z = await get_zone_row(db, g.zone_id)
    f = await P.feasibility_for(db, z, g.target_c, g.by_date)
    f.pop("mix", None)
    return f


@router.get("/goals/{goal_id}/plan", operation_id="goal_plan")
async def goal_plan(goal_id: uuid.UUID, db: DB, user: FullUser, lang: str = "en") -> dict:
    g = await G.get_visible(db, goal_id, user)
    z = await get_zone_row(db, g.zone_id)
    return await P.build_plan(db, z, g.target_c, g.by_date, lang_or_en(lang), goal_id=str(g.id))


@router.get("/plan/preview", operation_id="plan_preview")
async def plan_preview(
    db: DB, zone_id: str, target_c: float = Query(ge=-5, le=-0.05), by_date: date = Query(...), lang: str = "en"
) -> dict:
    """Plan and feasibility before a goal exists (the wizard, and guests drafting a goal)."""
    z = await get_zone_row(db, zone_id)
    return await P.build_plan(db, z, target_c, by_date, lang_or_en(lang))


@router.get("/budget", operation_id="budget")
async def budget(goal_id: uuid.UUID, db: DB, user: FullUser, lang: str = "en") -> dict:
    g = await G.get_visible(db, goal_id, user)
    z = await get_zone_row(db, g.zone_id)
    p = await P.build_plan(db, z, g.target_c, g.by_date, lang_or_en(lang), goal_id=str(g.id))
    return {**p["budget"], "meta": p["meta"]}


@router.get("/species", operation_id="species_list")
async def species(
    db: DB,
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    lang: str = "en",
) -> dict:
    return await P.species_list(db, lat, lng, lang_or_en(lang))


@router.get("/species/{species_id}", operation_id="species_get")
async def species_one(species_id: str, db: DB, lang: str = "en") -> dict:
    s = await db.get(Species, species_id)
    if s is None:
        raise not_found("species.not_found", "Species not found")
    from datetime import UTC, datetime

    from ..sources import SRC

    return {
        **P.species_detail(s, lang_or_en(lang)),
        "meta": {
            "live": True,
            "stale": False,
            "generated_at": datetime.now(UTC).isoformat(),
            "sources": [SRC["atmos_reference"].src(kind="reference").model_dump()],
        },
    }


@router.get("/nurseries", operation_id="nurseries")
async def nurseries(
    db: DB,
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius_m: int = Query(5000, ge=500, le=20000),
) -> dict:
    return await N.nearby(db, lat, lng, radius_m)


@router.get("/action-types", operation_id="action_types")
async def action_types(db: DB) -> list[dict]:
    rows = (await db.execute(select(ActionType).order_by(ActionType.position))).scalars().all()
    return [
        {
            "id": a.id,
            "title_code": a.title_code,
            "unit_code": a.unit_code,
            "points": a.points,
            "points_per": a.points_per,
            "cooling_per_unit": a.cooling_per_unit,
            "is_tree": a.is_tree,
            "emoji": a.emoji,
        }
        for a in rows
    ]
