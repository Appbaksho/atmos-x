"""A9: one-time import of a V0 device's IndexedDB data (goals, trees, actions, checks, fields, photos).

Idempotent by client id (stored as `v0:<id>`), so a retried upload adds nothing twice. Imported
claims never earn points by themselves: imported actions wait for a teammate or moderator review
(reason `imported`), imported trees linked to an imported planting stay "verifying" until that
review, and imported check-ins earn nothing. Goals whose zone is on the current map become goals;
the rest become drafts the wizard reopens. The `demo` namespace and simulated sensors are never sent.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime

import h3
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..engines import trees as TR
from ..errors import AppError
from ..models import (
    Action,
    ActionType,
    FarmField,
    Goal,
    GoalDraft,
    Photo,
    Profile,
    ScanZone,
    Species,
    Tree,
    TreeCheck,
    User,
)
from . import goals as G
from .actions import action_points
from .photos import ingest

log = logging.getLogger("atmos.import")

MAX_ITEMS = 500
MAX_PHOTOS = 60


class LatLngIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class GoalImport(BaseModel):
    id: str = Field(max_length=60)
    zone_centroid: LatLngIn | None = None
    zone_name: str | None = Field(default=None, max_length=200)
    target_c: float = Field(ge=-5, le=0)
    by_date: date


class TreeImport(BaseModel):
    id: str = Field(max_length=60)
    species_id: str = Field(default="unknown", max_length=40)
    nickname: str = Field(default="", max_length=60)
    planted_at: datetime
    location: LatLngIn | None = None
    photo_key: str | None = Field(default=None, max_length=80)
    action_id: str | None = Field(default=None, max_length=60)


class ActionImport(BaseModel):
    id: str = Field(max_length=60)
    action_type: str = Field(max_length=24)
    quantity: float = Field(gt=0, le=10000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    taken_at: datetime | None = None
    note: str | None = Field(default=None, max_length=500)
    zone_label: str | None = Field(default=None, max_length=200)
    photo_key: str | None = Field(default=None, max_length=80)
    created_at: datetime | None = None


class CheckImport(BaseModel):
    id: str = Field(max_length=60)
    tree_id: str = Field(max_length=60)
    health: str = Field(pattern="^(healthy|stressed|dead)$")
    note: str | None = Field(default=None, max_length=500)
    photo_key: str | None = Field(default=None, max_length=80)
    created_at: datetime


class FieldImport(BaseModel):
    id: str = Field(max_length=60)
    name: str = Field(max_length=80)
    crop: str = Field(max_length=12)
    stage: str = Field(max_length=12)
    location: LatLngIn
    area: float | None = Field(default=None, ge=0)


class ImportIn(BaseModel):
    goals: list[GoalImport] = Field(default_factory=list, max_length=MAX_ITEMS)
    trees: list[TreeImport] = Field(default_factory=list, max_length=MAX_ITEMS)
    actions: list[ActionImport] = Field(default_factory=list, max_length=MAX_ITEMS)
    checks: list[CheckImport] = Field(default_factory=list, max_length=MAX_ITEMS)
    fields: list[FieldImport] = Field(default_factory=list, max_length=MAX_ITEMS)


def _cid(v0_id: str) -> str:
    return f"v0:{v0_id}"[:64]


def _utc(d: datetime | None) -> datetime | None:
    if d is None:
        return None
    return d if d.tzinfo else d.replace(tzinfo=UTC)


async def _zone_at(db: AsyncSession, lat: float, lng: float) -> ScanZone | None:
    cell = h3.latlng_to_cell(lat, lng, 10)
    return (
        await db.execute(
            select(ScanZone).where(ScanZone.h3.contains([cell])).order_by(ScanZone.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()


async def run(
    db: AsyncSession, user: User, data: ImportIn, photos: dict[str, tuple[bytes, str]], lang: str = "en"
) -> dict:
    if len(photos) > MAX_PHOTOS:
        raise AppError(413, "import.too_many_photos", "Too many photos in one import")
    counts = {"goals": 0, "drafts": 0, "trees": 0, "actions": 0, "checks": 0, "fields": 0, "photos": 0, "skipped": 0}
    stored: dict[str, Photo] = {}

    async def photo_for(key: str | None, purpose: str) -> Photo | None:
        if not key or key not in photos:
            return None
        if key in stored:
            return stored[key]
        data_, mime = photos[key]
        try:
            p = await ingest(db, user.id, data_, mime, purpose)
        except AppError:
            counts["skipped"] += 1
            return None
        stored[key] = p
        counts["photos"] += 1
        return p

    today = datetime.now(UTC).date()
    for g in data.goals:
        cid = _cid(g.id)
        if (await db.execute(select(Goal.id).where(Goal.user_id == user.id, Goal.client_id == cid))).first():
            continue
        z = await _zone_at(db, g.zone_centroid.lat, g.zone_centroid.lng) if g.zone_centroid else None
        if z is not None and g.by_date > today and g.target_c < 0:
            try:
                await G.create(
                    db,
                    user,
                    zone_id=z.id,
                    target_c=max(-5.0, min(-0.05, g.target_c)),
                    by_date=g.by_date,
                    team_id=None,
                    lang=lang,
                    client_id=cid,
                )
                counts["goals"] += 1
                continue
            except AppError:
                pass
        # Not on the current map (or in the past): keep it as a draft the wizard can reopen.
        draft = {
            "source": "import",
            "client_id": cid,
            "zone_centroid": g.zone_centroid.model_dump() if g.zone_centroid else None,
            "zone_name": g.zone_name,
            "target_c": g.target_c,
            "by_date": g.by_date.isoformat(),
        }
        db.add(GoalDraft(user_id=user.id, payload=draft))
        counts["drafts"] += 1

    action_ids: dict[str, uuid.UUID] = {}
    for a in data.actions:
        cid = _cid(a.id)
        row = (
            await db.execute(select(Action.id).where(Action.user_id == user.id, Action.client_id == cid))
        ).scalar_one_or_none()
        if row:
            action_ids[a.id] = row
            continue
        at = await db.get(ActionType, a.action_type)
        if at is None:
            counts["skipped"] += 1
            continue
        p = await photo_for(a.photo_key, "action")
        qty = max(1, round(a.quantity))
        act = Action(
            user_id=user.id,
            action_type=at.id,
            quantity=qty,
            lat=a.lat,
            lng=a.lng,
            taken_at=_utc(a.taken_at),
            capture_source="upload",
            photo_id=p.id if p else None,
            note=(a.note or "").strip() or None,
            zone_label=a.zone_label,
            status="pending",
            checks=[{"code": "imported", "status": "skip", "reason": "imported"}],
            reason_code="imported",
            points=action_points(at, qty) if not at.is_tree else 0,
            cooling_c=0,
            client_id=cid,
        )
        if a.created_at:
            act.created_at = _utc(a.created_at)
        db.add(act)
        await db.flush()
        action_ids[a.id] = act.id
        counts["actions"] += 1

    tree_ids: dict[str, Tree] = {}
    for t in data.trees:
        cid = _cid(t.id)
        row = (
            await db.execute(select(Tree).where(Tree.user_id == user.id, Tree.client_id == cid))
        ).scalar_one_or_none()
        if row:
            tree_ids[t.id] = row
            continue
        p = await photo_for(t.photo_key, "tree_check")
        sp = t.species_id if (t.species_id == "unknown" or await db.get(Species, t.species_id)) else "unknown"
        planted = _utc(t.planted_at)
        tr = Tree(
            user_id=user.id,
            action_id=action_ids.get(t.action_id) if t.action_id else None,
            species_id=sp,
            nickname=t.nickname.strip()[:60],
            planted_at=planted,
            lat=t.location.lat if t.location else None,
            lng=t.location.lng if t.location else None,
            photo_id=p.id if p else None,
            next_due_at=TR.next_due(planted),
            client_id=cid,
        )
        db.add(tr)
        await db.flush()
        tree_ids[t.id] = tr
        counts["trees"] += 1

    for c in sorted(data.checks, key=lambda x: x.created_at):
        tr = tree_ids.get(c.tree_id)
        if tr is None:
            counts["skipped"] += 1
            continue
        cid = _cid(c.id)
        if (
            await db.execute(select(TreeCheck.id).where(TreeCheck.tree_id == tr.id, TreeCheck.client_id == cid))
        ).first():
            continue
        p = await photo_for(c.photo_key, "tree_check")
        at_ = _utc(c.created_at)
        tc = TreeCheck(
            tree_id=tr.id,
            user_id=user.id,
            photo_id=p.id if p else None,
            health=c.health,
            note=c.note,
            checks=[{"code": "imported", "status": "skip", "reason": "imported"}],
            on_time=False,
            points=0,
            client_id=cid,
        )
        tc.created_at = at_
        db.add(tc)
        if tr.last_check_at is None or at_ > tr.last_check_at:
            tr.last_check_at = at_
            tr.next_due_at = TR.next_due(at_)
        counts["checks"] += 1

    for f in data.fields:
        cid = _cid(f.id)
        if (
            await db.execute(select(FarmField.id).where(FarmField.user_id == user.id, FarmField.client_id == cid))
        ).first():
            continue
        db.add(
            FarmField(
                user_id=user.id,
                name=f.name,
                crop=f.crop,
                stage=f.stage,
                lat=f.location.lat,
                lng=f.location.lng,
                area=f.area,
                client_id=cid,
            )
        )
        counts["fields"] += 1

    prof = await db.get(Profile, user.id)
    if prof is not None:
        prof.imported_at = datetime.now(UTC)
    await db.commit()
    log.info("device import", extra={"data": {"user": str(user.id), **counts}})
    return counts
