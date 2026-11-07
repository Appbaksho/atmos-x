"""Goals, tasks and drafts on the server (prompt-v1 §6.6 G1–G5)."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..engines import cooling as CO
from ..errors import AppError, forbidden, not_found
from ..models import Action, ActionType, Goal, GoalDraft, GoalTask, ScanZone, TeamMember, User
from . import plan as P
from .scan import zone_name


async def _team_ids(db: AsyncSession, user_id) -> list[uuid.UUID]:
    return list((await db.execute(select(TeamMember.team_id).where(TeamMember.user_id == user_id))).scalars().all())


async def can_view(db: AsyncSession, g: Goal, user: User) -> bool:
    if g.user_id == user.id:
        return True
    return g.team_id is not None and g.team_id in await _team_ids(db, user.id)


async def can_edit(db: AsyncSession, g: Goal, user: User) -> bool:
    if g.user_id == user.id or user.role == "admin":
        return True
    if g.team_id is None:
        return False
    row = (
        await db.execute(select(TeamMember.role).where(TeamMember.team_id == g.team_id, TeamMember.user_id == user.id))
    ).scalar_one_or_none()
    return row == "lead"


async def progress(db: AsyncSession, g: Goal) -> dict:
    rows = (
        await db.execute(
            select(Action.action_type, Action.quantity, ActionType.cooling_per_unit)
            .join(ActionType, ActionType.id == Action.action_type)
            .where(Action.goal_id == g.id, Action.status == "verified")
        )
    ).all()
    area = max(CO.MIN_AREA_KM2, (g.targets or {}).get("area_km2") or CO.MIN_AREA_KM2)
    done = {"trees": 0.0, "roof_m2": 0.0, "shade": 0.0}
    modeled = 0.0
    for at, qty, per in rows:
        modeled += per * qty / area
        if at == "plant_tree":
            done["trees"] += qty
        elif at == "cool_roof":
            done["roof_m2"] += qty * 10
        elif at == "shade_structure":
            done["shade"] += qty
    t = g.targets or {}
    if g.kind == "action":
        parts = [min(1.0, done[k] / t[k]) for k in ("trees", "roof_m2", "shade") if t.get(k)]
        pct = round(100 * sum(parts) / len(parts)) if parts else 0
    else:
        pct = round(min(100.0, 100 * modeled / abs(g.target_c))) if g.target_c else 0
    return {"pct": pct, "modeled_c": round(modeled, 3), "done": done}


async def goal_out(db: AsyncSession, g: Goal, lang: str = "en") -> dict:
    p = await progress(db, g)
    name = g.zone_name
    if not name:
        z = await db.get(ScanZone, g.zone_id)
        if z is not None:
            name = zone_name(z, lang)[0] or f"Zone {z.rank}"
            if zone_name(z, lang)[0]:
                g.zone_name = name
                await db.commit()
    return {
        "id": str(g.id),
        "zone_id": g.zone_id,
        "zone_name": name,
        "zone_centroid": {"lat": g.zone_lat, "lng": g.zone_lng},
        "target_c": g.target_c,
        "by_date": g.by_date.isoformat(),
        "kind": g.kind,
        "targets": {k: v for k, v in (g.targets or {}).items() if k in ("trees", "roof_m2", "shade", "long_term_c")},
        "progress_pct": p["pct"],
        "modeled_c": p["modeled_c"],
        "done": p["done"],
        "team_id": str(g.team_id) if g.team_id else None,
        "org_id": str(g.org_id) if g.org_id else None,
        "status": g.status,
        "owner_id": str(g.user_id),
        "created_at": g.created_at.isoformat(),
    }


async def create(
    db: AsyncSession,
    user: User,
    *,
    zone_id: str,
    target_c: float,
    by_date: date,
    team_id: uuid.UUID | None,
    lang: str,
    client_id: str | None = None,
) -> Goal:
    if client_id:
        existing = (
            await db.execute(select(Goal).where(Goal.user_id == user.id, Goal.client_id == client_id))
        ).scalar_one_or_none()
        if existing:
            return existing
    z = await db.get(ScanZone, zone_id)
    if z is None:
        raise not_found("zone.not_found", "This zone isn't on the map any more")
    if by_date <= datetime.now(UTC).date():
        raise AppError(400, "goal.date_past", "Pick a date in the future", fields={"by_date": "past"})
    if team_id is not None and team_id not in await _team_ids(db, user.id):
        raise forbidden("team.not_member", "You are not in that team")
    f = await P.feasibility_for(db, z, target_c, by_date)
    name, _ = zone_name(z, lang)
    g = Goal(
        user_id=user.id,
        team_id=team_id,
        zone_id=z.id,
        zone_name=name,  # '' while the zone is unnamed; goal_out resolves it from the zone row
        zone_lat=z.centroid_lat,
        zone_lng=z.centroid_lng,
        target_c=round(target_c, 2),
        by_date=by_date,
        kind=f["kind"],
        targets={
            **f["mix"]["needed"],
            "trees": f["mix"]["trees"],
            "roof_m2": f["mix"]["roof_m2"],
            "shade": f["mix"]["shade"],
            "area_km2": z.area_km2,
            "long_term_c": f["mix"]["cooling_c"],
        },
        client_id=client_id,
    )
    db.add(g)
    await db.flush()
    # Tasks from the plan steps, spread over the timeline, owned by the creator (G4).
    days = max(14, (by_date - datetime.now(UTC).date()).days)
    plan_steps = P.steps(f["mix"], f["kind"])
    action_of = {"plan.step.plant.title": "plant_tree", "plan.step.roofs.title": "cool_roof"}
    qty_of = {"plant_tree": f["mix"]["trees"], "cool_roof": f["mix"]["roof_m2"] / 10}
    for i, st in enumerate(plan_steps):
        at = action_of.get(st["title"]["code"])
        db.add(
            GoalTask(
                goal_id=g.id,
                title=st["title"],
                action_type=at,
                qty=qty_of.get(at) if at else None,
                owner_id=user.id,
                due_date=datetime.now(UTC).date() + timedelta(days=round(days * (i + 1) / (len(plan_steps) + 1))),
                position=i,
            )
        )
    await db.commit()
    return g


async def mine(db: AsyncSession, user: User) -> list[Goal]:
    teams = await _team_ids(db, user.id)
    q = (
        select(Goal)
        .where(Goal.status != "deleted", or_(Goal.user_id == user.id, Goal.team_id.in_(teams) if teams else false()))
        .order_by(Goal.created_at.desc())
    )
    return list((await db.execute(q)).scalars().all())


async def get_visible(db: AsyncSession, goal_id: uuid.UUID, user: User) -> Goal:
    g = await db.get(Goal, goal_id)
    if g is None or g.status == "deleted" or not await can_view(db, g, user):
        raise not_found("goal.not_found", "Goal not found")
    return g


def task_out(t: GoalTask) -> dict:
    return {
        "id": str(t.id),
        "title": t.title,
        "action_type": t.action_type,
        "qty": t.qty,
        "owner_id": str(t.owner_id) if t.owner_id else None,
        "due": t.due_date.isoformat() if t.due_date else None,
        "status": t.status,
    }


async def save_draft(db: AsyncSession, user: User, payload: dict) -> GoalDraft:
    d = GoalDraft(user_id=user.id, payload=payload)
    db.add(d)
    await db.commit()
    return d


async def latest_draft(db: AsyncSession, user: User) -> GoalDraft | None:
    return (
        await db.execute(
            select(GoalDraft).where(GoalDraft.user_id == user.id).order_by(GoalDraft.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
