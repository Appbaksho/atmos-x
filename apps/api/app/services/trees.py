"""My trees (prompt-v1 §6.7 T1–T6): states, timeline, 15-day check-ins, milestones and points.

A check-in is a photo, the person's own health report and an optional height. Deterministic checks
run on the photo; an on-time check-in of a verified tree earns PT2 (pending until the tree's 90-day
check-in). The 90-day check-in awards PT3 and unlocks the tree's pending points (PT9); the 1-year
check-in awards PT4. Tips come from the species, the month and recent rain.
"""

from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..engines import trees as TR
from ..engines.heat import haversine_m
from ..errors import AppError, forbidden, not_found
from ..media import photo_url
from ..models import Action, Photo, Species, TeamMember, Tree, TreeCheck, TreeHelper, User
from . import badges as B
from . import cache
from . import points as PTS
from .conditions import recent_key
from .hydro import imerg_key
from .notify import notify
from .photos import hamming

CHECK_POINTS = 10  # PT2
PT3, PT4 = 50, 200
TREE_COOLING_AT_MATURITY_C = 0.0006  # per tree for a 1 km² neighbourhood (estimate)
INVITE_TTL = timedelta(days=14)


async def rain_7d(db: AsyncSession, lat: float | None, lng: float | None) -> tuple[float | None, str | None]:
    """IMERG (satellite) → NASA POWER (model) → None. Cache reads only."""
    if lat is None or lng is None:
        return None, None
    hit = await cache.peek(db, imerg_key(lat, lng))
    if hit and hit.value.get("sum_mm") is not None:
        return float(hit.value["sum_mm"]), "imerg"
    hit = await cache.peek(db, recent_key(lat, lng))
    if hit:
        days = [d.get("rain_mm") for d in hit.value.get("days", [])[-7:] if d.get("rain_mm") is not None]
        if days:
            return float(sum(days)), "power"
    return None, None


async def forecast_rain_3d(db: AsyncSession, lat: float | None, lng: float | None) -> float | None:
    if lat is None or lng is None:
        return None
    from ..providers import open_meteo

    clat, clng = open_meteo.cell(lat, lng)
    hit = await cache.peek(db, f"om:fc:{clat},{clng}")
    if not hit:
        return None
    today = hit.value["current"]["time"][:10]
    days = [d for d in hit.value["daily"] if d["date"] >= today][:3]
    return float(sum(d["rain"] or 0 for d in days)) if days else None


async def _verified(db: AsyncSession, t: Tree) -> bool:
    if t.action_id is None:
        return True  # tracked by hand: no planting action to verify, and no planting points
    a = await db.get(Action, t.action_id)
    return a is not None and a.status == "verified"


async def can_see(db: AsyncSession, t: Tree, viewer: User) -> bool:
    if viewer.id == t.user_id or viewer.role in ("moderator", "admin"):
        return True
    if (
        await db.execute(select(TreeHelper.user_id).where(TreeHelper.tree_id == t.id, TreeHelper.user_id == viewer.id))
    ).first():
        return True
    if t.team_id is None:
        return False
    return bool(
        (
            await db.execute(
                select(TeamMember.user_id).where(TeamMember.team_id == t.team_id, TeamMember.user_id == viewer.id)
            )
        ).first()
    )


async def tree_out(db: AsyncSession, t: Tree, viewer: User | None, *, with_checks: bool = False) -> dict:
    now = datetime.now(UTC)
    checks = (
        (await db.execute(select(TreeCheck).where(TreeCheck.tree_id == t.id).order_by(TreeCheck.created_at.desc())))
        .scalars()
        .all()
    )
    healths = [c.health for c in checks]
    verified = await _verified(db, t)
    rain, rain_src = await rain_7d(db, t.lat, t.lng)
    fc = await forecast_rain_3d(db, t.lat, t.lng)
    st = TR.state(
        verified=verified,
        revoked=t.revoked,
        lost_confirmed=t.lost_confirmed,
        planted_at=t.planted_at,
        next_due_at=t.next_due_at,
        healths=healths,
        now=now,
        rain_7d_mm=rain,
        rain_forecast_3d_mm=fc,
    )
    overdue = (now - t.next_due_at).days
    status = "overdue" if overdue > 0 else ("due" if (t.next_due_at - now).days <= TR.CFG["due_within_days"] else "ok")
    sp = await db.get(Species, t.species_id)
    precise = viewer is not None and await can_see(db, t, viewer)
    latest_photo = next((c.photo_id for c in checks if c.photo_id), None) or t.photo_id
    out = {
        "id": str(t.id),
        "species_id": t.species_id,
        "nickname": t.nickname,
        "planted_at": t.planted_at.isoformat(),
        "age_days": (now - t.planted_at).days,
        "location": {"lat": t.lat, "lng": t.lng} if precise and t.lat is not None else None,
        "last_check_at": t.last_check_at.isoformat() if t.last_check_at else None,
        "next_due_at": t.next_due_at.isoformat(),
        "status": status,
        "state": st,
        "health": healths[0] if healths else "healthy",
        "photo_url": photo_url(latest_photo, "public") if precise else None,
        "team_id": str(t.team_id) if t.team_id else None,
        "action_id": str(t.action_id) if t.action_id else None,
        "verified": verified,
        "milestones": t.milestones,
        "cooling_c_est": round(TREE_COOLING_AT_MATURITY_C * TR_ramp((now - t.planted_at).days / 365.25), 5),
        "rain_7d_mm": rain,
        "rain_source": rain_src,
    }
    if with_checks:
        out["checks"] = [
            {
                "id": str(c.id),
                "tree_id": str(t.id),
                "photo_url": photo_url(c.photo_id, "public") if precise else None,
                "health": c.health,
                "height_cm": c.height_cm,
                "note": c.note,
                "on_time": c.on_time,
                "checks": c.checks,
                "points": c.points,
                "tip": c.tip,
                "created_at": c.created_at.isoformat(),
            }
            for c in checks
        ]
        out["tips"] = TR.tips(
            species_water=sp.water if sp else "medium",
            month=now.month,
            rain_7d_mm=rain,
            health=healths[0] if healths else None,
            age_days=out["age_days"],
        )
    return out


def TR_ramp(years: float) -> float:  # noqa: N802
    from ..engines.cooling import tree_ramp

    return tree_ramp(years)


async def get_owned(db: AsyncSession, tree_id: uuid.UUID, user: User, *, edit: bool = False) -> Tree:
    t = await db.get(Tree, tree_id)
    if t is None or not await can_see(db, t, user):
        raise not_found("tree.not_found", "Tree not found")
    if edit and t.user_id != user.id:
        raise forbidden("tree.not_owner", "Only the person who planted it can change it")
    return t


async def add_manual(
    db: AsyncSession,
    user: User,
    *,
    species_id: str,
    nickname: str,
    planted_at: datetime,
    lat: float | None,
    lng: float | None,
    photo: Photo | None,
    client_id: str | None,
) -> Tree:
    if client_id:
        dup = (
            await db.execute(select(Tree).where(Tree.user_id == user.id, Tree.client_id == client_id))
        ).scalar_one_or_none()
        if dup:
            return dup
    t = Tree(
        user_id=user.id,
        species_id=species_id,
        nickname=nickname.strip()[:60],
        planted_at=planted_at,
        lat=lat,
        lng=lng,
        photo_id=photo.id if photo else None,
        next_due_at=TR.next_due(datetime.now(UTC)),
        client_id=client_id,
    )
    db.add(t)
    await db.commit()
    return t


async def check_in(
    db: AsyncSession,
    user: User,
    t: Tree,
    *,
    photo: Photo | None,
    health: str,
    height_cm: float | None,
    note: str | None,
    lat: float | None,
    lng: float | None,
) -> TreeCheck:
    if t.user_id != user.id:
        # Friends invited to water it may check in for the owner's tree (T5); points stay with the owner.
        if not await can_see(db, t, user):
            raise forbidden("tree.not_owner", "Only the tree's owner or team can check in")
    if health not in ("healthy", "stressed", "dead"):
        raise AppError(400, "tree.health", "Pick healthy, stressed or dead")
    now = datetime.now(UTC)
    checks: list[dict] = []
    checks.append(
        {"code": "photo_present", "status": "pass" if photo else "fail", "reason": None if photo else "no_photo"}
    )
    if photo and lat is not None and t.lat is not None:
        d = haversine_m(lat, lng, t.lat, t.lng)
        checks.append(
            {
                "code": "gps_near_tree",
                "status": "pass" if d <= 100 else "fail",
                "reason": None if d <= 100 else "gps_far",
                "params": {"dist_m": round(d)},
            }
        )
    if photo and photo.phash:
        prev = (
            (
                await db.execute(
                    select(Photo.phash).join(TreeCheck, TreeCheck.photo_id == Photo.id).where(TreeCheck.tree_id == t.id)
                )
            )
            .scalars()
            .all()
        )
        dmin = min((hamming(photo.phash, h) for h in prev if h), default=99)
        checks.append(
            {
                "code": "not_duplicate",
                "status": "pass" if dmin > 6 else "fail",
                "reason": None if dmin > 6 else "duplicate_photo",
            }
        )
    if photo and health != "dead":
        ok = (photo.green_share or 0) >= 0.08
        checks.append(
            {"code": "content_plausible", "status": "pass" if ok else "fail", "reason": None if ok else "not_green"}
        )
    passed = all(c["status"] != "fail" for c in checks)
    on_time = TR.on_time(t.next_due_at, now)
    verified = await _verified(db, t)
    sp = await db.get(Species, t.species_id)
    rain, _ = await rain_7d(db, t.lat, t.lng)
    tip = TR.tips(
        species_water=sp.water if sp else "medium",
        month=now.month,
        rain_7d_mm=rain,
        health=health,
        age_days=(now - t.planted_at).days,
    )[0]
    c = TreeCheck(
        tree_id=t.id,
        user_id=user.id,
        photo_id=photo.id if photo else None,
        health=health,
        height_cm=height_cm,
        note=(note or "")[:500] or None,
        checks=checks,
        on_time=on_time and passed,
        points=0,
        tip=tip,
    )
    db.add(c)
    await db.flush()
    owner = t.user_id
    if passed and on_time and verified and t.action_id is not None:
        r = await PTS.earn(
            db, owner, CHECK_POINTS, rule_id="PT2", source_type="check", source_id=str(c.id), tree_id=t.id
        )
        c.points = r.amount if r else 0
    t.last_check_at = now
    t.next_due_at = TR.next_due(now)
    age = (now - t.planted_at).days
    if passed and health != "dead" and verified and t.action_id is not None:
        ms = dict(t.milestones or {})
        if age >= TR.CFG["milestone_d90"] and "d90" not in ms:
            ms["d90"] = now.isoformat()
            await PTS.earn(
                db, owner, PT3, rule_id="PT3", source_type="tree", source_id=str(t.id), tree_id=t.id, state="spendable"
            )
            # PT9: the tree's pending points become spendable at its 90-day check-in.
            await PTS.unlock_tree(db, t.id)
            await notify(
                db,
                owner,
                "tree_milestone",
                {"code": "notif.tree.d90", "params": {"name": t.nickname}},
                screen="S20",
                params={"tree_id": str(t.id)},
                dedupe_key=f"tree:{t.id}:d90",
            )
        if age >= TR.CFG["milestone_y1"] and "y1" not in ms:
            ms["y1"] = now.isoformat()
            await PTS.earn(
                db,
                owner,
                PT4,
                rule_id="PT4",
                source_type="tree_y1",
                source_id=str(t.id),
                tree_id=t.id,
                state="spendable",
            )
            await notify(
                db,
                owner,
                "tree_milestone",
                {"code": "notif.tree.y1", "params": {"name": t.nickname}},
                screen="S20",
                params={"tree_id": str(t.id)},
                dedupe_key=f"tree:{t.id}:y1",
            )
        t.milestones = ms
    if health == "dead":
        await notify(
            db,
            owner,
            "tree_due",
            {"code": "notif.tree.lost", "params": {"name": t.nickname}},
            screen="S20",
            params={"tree_id": str(t.id)},
        )
    await B.evaluate(db, owner)
    await db.commit()
    return c


async def patch(
    db: AsyncSession, t: Tree, *, nickname: str | None, species_id: str | None, lost_confirmed: bool | None
) -> Tree:
    if nickname is not None:
        t.nickname = nickname.strip()[:60]
    if species_id is not None:
        if await db.get(Species, species_id) is None and species_id != "unknown":
            raise AppError(400, "tree.species", "Unknown species")
        t.species_id = species_id
    if lost_confirmed is not None:
        t.lost_confirmed = lost_confirmed
    await db.commit()
    return t


def make_invite(t: Tree, by: User) -> dict:
    """T5: a signed link a friend opens to help water this tree. Not a session token (no `sub`)."""
    now = int(time.time())
    exp = now + int(INVITE_TTL.total_seconds())
    token = jwt.encode(
        {"typ": "tree_invite", "tree": str(t.id), "by": str(by.id), "iat": now, "exp": exp},
        settings.jwt_secret,
        algorithm="HS256",
    )
    return {
        "token": token,
        "path": f"/app/tree/join?t={token}",
        "expires_at": datetime.fromtimestamp(exp, UTC).isoformat(),
    }


def read_invite(token: str) -> dict:
    try:
        p = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], options={"require": ["exp", "iat"]})
    except jwt.PyJWTError:
        raise AppError(400, "tree.invite_invalid", "This invite link has expired or is not valid")
    if p.get("typ") != "tree_invite":
        raise AppError(400, "tree.invite_invalid", "This invite link has expired or is not valid")
    return p


async def accept_invite(db: AsyncSession, user: User, token: str) -> Tree:
    p = read_invite(token)
    t = await db.get(Tree, uuid.UUID(p["tree"]))
    if t is None or t.revoked:
        raise not_found("tree.not_found", "Tree not found")
    inviter = uuid.UUID(p["by"])
    if user.id != t.user_id:
        exists = (
            await db.execute(select(TreeHelper).where(TreeHelper.tree_id == t.id, TreeHelper.user_id == user.id))
        ).scalar_one_or_none()
        if exists is None:
            db.add(TreeHelper(tree_id=t.id, user_id=user.id, invited_by=inviter))
            await notify(
                db,
                t.user_id,
                "tree_helper",
                {"code": "notif.tree.helper_joined", "params": {"name": t.nickname, "who": user.display_name}},
                screen="S20",
                params={"tree_id": str(t.id)},
            )
        # PT7: a person who signed up after the invite was issued counts as invited by that friend.
        if user.invited_by_id is None and user.id != inviter and user.created_at.timestamp() >= p["iat"] - 60:
            user.invited_by_id = inviter
    await db.commit()
    return t


async def delete(db: AsyncSession, t: Tree) -> None:
    t.revoked = True
    await PTS.revoke_tree(db, t.id)
    await db.commit()
