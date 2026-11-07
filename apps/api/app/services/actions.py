"""Log actions, verify them deterministically, review them (prompt-v1 §7.11, §6.7).

Points are computed on the server only. A verified planting earns PT1 per tree, pending until that
tree's 90-day check-in. Other verified actions earn their action points, pending for 90 days (an
assumption recorded in decisions). Pending actions go to review by a different person: a teammate or
a moderator. Rejected actions revoke their points and their trees.
"""

from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime, timedelta

import h3
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..engines import cooling as CO
from ..engines import trees as TR
from ..engines import verify as V
from ..errors import AppError, forbidden, not_found
from ..media import photo_url
from ..models import (
    Action,
    ActionReview,
    ActionType,
    Goal,
    HeatCell,
    Photo,
    PlantingSpots,
    ScanZone,
    TeamMember,
    Tree,
    User,
)
from ..providers.rasterio_io import utm_epsg
from ..ratelimit import day_start_local
from . import badges as B
from . import points as PTS
from .notify import notify
from .photos import hamming
from .spots import zone_polygon

MAX_TREES_PER_LOG = 20
DAILY_ACTIONS = 30
FRIEND_POINTS = 25  # PT7
PT1_PER_TREE = 50


async def _team_ids(db: AsyncSession, user_id) -> set[uuid.UUID]:
    return set((await db.execute(select(TeamMember.team_id).where(TeamMember.user_id == user_id))).scalars().all())


def _dist_to_zone_m(z: ScanZone, lat: float, lng: float) -> float:
    if h3.latlng_to_cell(lat, lng, 10) in set(z.h3):
        return 0.0
    poly = zone_polygon(list(z.h3))
    fwd = Transformer.from_crs("EPSG:4326", utm_epsg(lat, lng), always_xy=True).transform
    return transform(fwd, poly).distance(transform(fwd, Point(lng, lat)))


async def _inside_building(db: AsyncSession, zone_id: str | None, lat: float, lng: float) -> bool | None:
    if not zone_id:
        return None
    row = await db.get(PlantingSpots, zone_id)
    if row is None or row.status != "ready":
        return None
    p = Point(lng, lat)
    for f in row.features:
        if f["properties"].get("kind") == "roof":
            try:
                if shape(f["geometry"]).contains(p):
                    return True
            except Exception:
                continue
    return False


async def _min_phash_distance(db: AsyncSession, phash: str | None, exclude: uuid.UUID) -> int | None:
    if not phash:
        return None
    rows = (
        (
            await db.execute(
                select(Photo.phash)
                .where(Photo.phash.is_not(None), Photo.id != exclude, Photo.purpose.in_(("action", "tree_check")))
                .order_by(Photo.created_at.desc())
                .limit(5000)
            )
        )
        .scalars()
        .all()
    )
    return min((hamming(phash, h) for h in rows), default=None)


def action_points(at: ActionType, quantity: float) -> int:
    return int(at.points * math.floor(quantity / max(1.0, at.points_per)))


async def evidence_checks(
    db: AsyncSession,
    user: User,
    at: ActionType,
    *,
    lat,
    lng,
    accuracy_m,
    taken_at,
    capture_source,
    photo: Photo | None,
    goal: Goal | None,
    now: datetime,
) -> list[dict]:
    z = await db.get(ScanZone, goal.zone_id) if goal else None
    target = _dist_to_zone_m(z, lat, lng) if (z is not None and lat is not None and lng is not None) else None
    cell = await db.get(HeatCell, h3.latlng_to_cell(lat, lng, 10)) if lat is not None and lng is not None else None
    prev = (
        await db.execute(
            select(Action)
            .where(Action.user_id == user.id, Action.lat.is_not(None), Action.taken_at.is_not(None))
            .order_by(Action.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    ev = V.Evidence(
        action_type=at.id,
        content_check=at.content_check,
        is_ground=at.is_ground,
        lat=lat,
        lng=lng,
        accuracy_m=accuracy_m,
        taken_at=taken_at,
        now=now,
        capture_source=capture_source,
        exif_time=photo.exif_time if photo else None,
        exif_lat=photo.exif_lat if photo else None,
        exif_lng=photo.exif_lng if photo else None,
        has_photo=photo is not None,
        phash_min_distance=await _min_phash_distance(db, photo.phash, photo.id) if photo else None,
        green_share=photo.green_share if photo else None,
        bright_share=photo.bright_share if photo else None,
        target_dist_m=target,
        hex_water_share=cell.water if cell else None,
        inside_building=await _inside_building(db, goal.zone_id if goal else None, lat, lng)
        if lat is not None
        else None,
        prev_lat=prev.lat if prev else None,
        prev_lng=prev.lng if prev else None,
        prev_at=prev.taken_at if prev else None,
    )
    return V.check(ev)


async def award(db: AsyncSession, a: Action, at: ActionType) -> int:
    """Points for a verified action (idempotent)."""
    now = datetime.now(UTC)
    total = 0
    if at.is_tree:
        trees = (await db.execute(select(Tree).where(Tree.action_id == a.id, Tree.revoked.is_(False)))).scalars().all()
        for t in trees:
            r = await PTS.earn(
                db, a.user_id, PT1_PER_TREE, rule_id="PT1", source_type="tree", source_id=str(t.id), tree_id=t.id
            )
            total += r.amount if r else 0
        # PT7: the friend who invited this person earns once, when their first planting is verified.
        owner = await db.get(User, a.user_id)
        if trees and owner is not None and owner.invited_by_id is not None:
            await PTS.earn(
                db,
                owner.invited_by_id,
                FRIEND_POINTS,
                rule_id="PT7",
                source_type="friend",
                source_id=str(owner.id),
                unlock_at=now + PTS.UNLOCK_AFTER,
            )
    else:
        pts = action_points(at, a.quantity)
        rule = "PT5" if at.id == "cool_roof" else "ACTION"
        r = await PTS.earn(
            db,
            a.user_id,
            pts,
            rule_id=rule,
            source_type="action",
            source_id=str(a.id),
            unlock_at=now + PTS.UNLOCK_AFTER,
        )
        total += r.amount if r else 0
    a.points = max(a.points, total) if total else a.points
    if a.goal_id is not None:
        goal = await db.get(Goal, a.goal_id)
        if goal is not None and goal.team_id is not None:
            from . import teams as TEAMS

            await db.flush()
            await TEAMS.team_goal_reached(db, goal)
    return total


async def log(
    db: AsyncSession,
    user: User,
    *,
    action_type: str,
    quantity: float,
    lat: float | None,
    lng: float | None,
    accuracy_m: float | None,
    taken_at: datetime | None,
    capture_source: str,
    photo: Photo | None,
    goal_id: uuid.UUID | None,
    team_id: uuid.UUID | None,
    species_id: str | None,
    nickname: str | None,
    note: str | None,
    client_id: str | None,
    device_id: str | None,
) -> tuple[Action, list[Tree]]:
    if client_id:
        dup = (
            await db.execute(select(Action).where(Action.user_id == user.id, Action.client_id == client_id))
        ).scalar_one_or_none()
        if dup:
            trees = (await db.execute(select(Tree).where(Tree.action_id == dup.id))).scalars().all()
            return dup, list(trees)
    at = await db.get(ActionType, action_type)
    if at is None:
        raise AppError(400, "action.type", "Unknown action type")
    if not (0 < quantity <= 10000):
        raise AppError(400, "action.quantity", "Quantity must be between 1 and 10,000")
    now = datetime.now(UTC)
    today = day_start_local(now)
    n_today = (
        await db.execute(
            select(func.count()).select_from(Action).where(Action.user_id == user.id, Action.created_at >= today)
        )
    ).scalar_one()
    if n_today >= DAILY_ACTIONS:
        raise AppError(
            429,
            "action.daily_limit",
            "Daily limit reached; log more tomorrow",
            retry_after=int((today + timedelta(days=1) - now).total_seconds()),
        )
    goal = None
    if goal_id:
        goal = await db.get(Goal, goal_id)
        if goal is None or (goal.user_id != user.id and goal.team_id not in await _team_ids(db, user.id)):
            raise not_found("goal.not_found", "Goal not found")
    if team_id and team_id not in await _team_ids(db, user.id):
        raise forbidden("team.not_member", "You are not in that team")
    team_id = team_id or (goal.team_id if goal else None)
    if taken_at and taken_at.tzinfo is None:
        taken_at = taken_at.replace(tzinfo=UTC)
    checks = await evidence_checks(
        db,
        user,
        at,
        lat=lat,
        lng=lng,
        accuracy_m=accuracy_m,
        taken_at=taken_at,
        capture_source=capture_source,
        photo=photo,
        goal=goal,
        now=now,
    )
    status, reason = V.verdict(checks)
    area = (goal.targets or {}).get("area_km2") if goal else None
    a = Action(
        user_id=user.id,
        action_type=at.id,
        quantity=quantity,
        lat=lat,
        lng=lng,
        accuracy_m=accuracy_m,
        taken_at=taken_at,
        capture_source=capture_source if capture_source in ("camera", "upload") else "upload",
        photo_id=photo.id if photo else None,
        goal_id=goal.id if goal else None,
        team_id=team_id,
        species_id=species_id,
        nickname=(nickname or "").strip()[:60] or None,
        note=(note or "").strip()[:500] or None,
        zone_label=goal.zone_name if goal else None,
        status=status,
        checks=checks,
        reason_code=reason,
        points=0,
        cooling_c=round(at.cooling_per_unit * quantity / CO.eff_area(area or CO.MIN_AREA_KM2), 4),
        device_id=device_id,
        client_id=client_id,
        verified_at=now if status == "verified" else None,
    )
    db.add(a)
    await db.flush()
    trees: list[Tree] = []
    if at.is_tree:
        n = min(int(quantity), MAX_TREES_PER_LOG)
        base = (nickname or "").strip()
        planted = taken_at or now
        for i in range(n):
            t = Tree(
                user_id=user.id,
                action_id=a.id,
                team_id=team_id,
                species_id=species_id or "unknown",
                nickname=(f"{base} {i + 1}" if base and n > 1 else base) or "",
                planted_at=planted,
                lat=lat,
                lng=lng,
                photo_id=photo.id if photo else None,
                next_due_at=TR.next_due(planted),
            )
            db.add(t)
            trees.append(t)
        await db.flush()
    if status == "verified":
        await award(db, a, at)
        a.points = await _points_of(db, a, trees)
    else:
        a.points = (PT1_PER_TREE * len(trees)) if at.is_tree else action_points(at, quantity)
    await notify(
        db,
        user.id,
        "verification",
        {
            "code": "notif.verification.verified" if status == "verified" else "notif.verification.pending",
            "params": {"action": at.id, "qty": quantity, "points": a.points},
        },
        body=None
        if status == "verified"
        else {"code": "notif.verification.pending_body", "params": {"reason": reason or ""}},
        screen="S15",
        params={"id": str(a.id)},
    )
    await B.evaluate(db, user.id)
    await db.commit()
    return a, trees


async def _points_of(db: AsyncSession, a: Action, trees: list[Tree]) -> int:
    from ..models import PointsLedger

    ids = [str(t.id) for t in trees] + [str(a.id)]
    total = (
        await db.execute(
            select(func.coalesce(func.sum(PointsLedger.amount), 0)).where(
                PointsLedger.kind == "earn", PointsLedger.source_id.in_(ids)
            )
        )
    ).scalar_one()
    return int(total)


async def can_review(db: AsyncSession, a: Action, reviewer: User) -> bool:
    if reviewer.id == a.user_id:
        return False
    if reviewer.role in ("moderator", "admin"):
        return True
    shared = await _team_ids(db, reviewer.id) & await _team_ids(db, a.user_id)
    return bool(shared) if a.team_id is None else a.team_id in shared


async def review(db: AsyncSession, a: Action, reviewer: User, approve: bool, note: str | None) -> Action:
    if a.status != "pending":
        raise AppError(409, "action.not_pending", "This action is not waiting for review")
    if not await can_review(db, a, reviewer):
        raise forbidden(
            "action.review_forbidden", "A teammate or a moderator reviews this, not the person who logged it"
        )
    db.add(ActionReview(action_id=a.id, reviewer_id=reviewer.id, approve=approve, note=note))
    at = await db.get(ActionType, a.action_type)
    if approve:
        a.status = "verified"
        a.verified_at = datetime.now(UTC)
        a.reason_code = "reviewed"
        await award(db, a, at)
        trees = (await db.execute(select(Tree).where(Tree.action_id == a.id))).scalars().all()
        a.points = await _points_of(db, a, list(trees))
    else:
        a.status = "rejected"
        a.reason_code = "review_rejected"
        await PTS.revoke_source(db, "action", str(a.id))
        for t in (await db.execute(select(Tree).where(Tree.action_id == a.id))).scalars().all():
            t.revoked = True
            await PTS.revoke_tree(db, t.id)
    await notify(
        db,
        a.user_id,
        "verification",
        {
            "code": "notif.verification.reviewed_ok" if approve else "notif.verification.reviewed_no",
            "params": {"action": a.action_type, "points": a.points},
        },
        screen="S15",
        params={"id": str(a.id)},
    )
    await B.evaluate(db, a.user_id)
    await db.commit()
    return a


async def action_out(db: AsyncSession, a: Action, viewer: User | None) -> dict:
    precise = viewer is not None and (
        viewer.id == a.user_id
        or viewer.role in ("moderator", "admin")
        or (a.team_id is not None and a.team_id in await _team_ids(db, viewer.id))
    )
    n_trees = (await db.execute(select(func.count()).select_from(Tree).where(Tree.action_id == a.id))).scalar_one()
    return {
        "id": str(a.id),
        "user_id": str(a.user_id),
        "action_type": a.action_type,
        "quantity": a.quantity,
        "points": a.points,
        "cooling_c": a.cooling_c,
        "trees": n_trees,
        "status": a.status,
        "photo_url": photo_url(a.photo_id, "public") if precise else None,
        "lat": a.lat if precise else None,
        "lng": a.lng if precise else None,
        "taken_at": a.taken_at.isoformat() if a.taken_at else None,
        "goal_id": str(a.goal_id) if a.goal_id else None,
        "team_id": str(a.team_id) if a.team_id else None,
        "zone_label": a.zone_label,
        "note": a.note,
        "checks": a.checks,
        "reason_code": a.reason_code,
        "capture_source": a.capture_source,
        "can_review": viewer is not None and a.status == "pending" and await can_review(db, a, viewer),
        "created_at": a.created_at.isoformat(),
    }
