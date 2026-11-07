"""Leaderboards (prompt-v1 §6.8 C11, PT10): verified points by person, team and organization.

Scope: area (within 3 km of the requester), city or country. Period: calendar week (from Monday),
calendar month (resets on the 1st so newcomers can win) or all time, in Dhaka time. Top 50 plus a
"you" row. Demo users only ever see the demo community, and real boards never include demo rows.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import AppError
from ..models import Action, Org, Profile, Team, User
from ..sources import SRC
from . import people
from .teams import team_stats

AREA_M = 3000
TOP = 50
TZ_MIN = 360


def period_start(period: str, now: datetime | None = None) -> datetime | None:
    now = now or datetime.now(UTC)
    local = now + timedelta(minutes=TZ_MIN)
    if period == "all":
        return None
    if period == "week":
        start = (local - timedelta(days=local.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "month":
        start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        raise AppError(400, "leaderboard.period", "Pick week, month or all")
    return start - timedelta(minutes=TZ_MIN)


async def _where_me(db: AsyncSession, viewer: User | None, lat: float | None, lng: float | None) -> dict:
    prof = await db.get(Profile, viewer.id) if viewer is not None else None
    return {
        "lat": lat if lat is not None else (prof.home_lat if prof else None),
        "lng": lng if lng is not None else (prof.home_lng if prof else None),
        "city": (prof.city or "").strip() or None if prof else None,
        "country": prof.country_code if prof else None,
    }


async def board(
    db: AsyncSession, viewer: User | None, subject: str, scope: str, period: str, lat: float | None, lng: float | None
) -> dict:
    if subject not in ("user", "team", "org"):
        raise AppError(400, "leaderboard.subject", "Pick user, team or org")
    if scope not in ("area", "city", "country"):
        raise AppError(400, "leaderboard.scope", "Pick area, city or country")
    since = period_start(period)
    where = await _where_me(db, viewer, lat, lng)
    demo = bool(viewer is not None and viewer.is_demo)
    if (
        (scope == "area" and where["lat"] is None)
        or (scope == "city" and not where["city"])
        or (scope == "country" and not where["country"])
    ):
        return {"rows": [], "me": None, "status": "no_place", "meta": _meta()}
    if subject == "user":
        rows, me = await _users(db, viewer, scope, since, where, demo)
    else:
        rows, me = await _teams_or_orgs(db, viewer, subject, scope, since, where, demo)
    return {"rows": rows, "me": me, "status": "ready", "since": since.isoformat() if since else None, "meta": _meta()}


def _p(sql: str, params: dict) -> dict:
    """Only the bind parameters the statement uses."""
    return {k: v for k, v in params.items() if f":{k}" in sql}


def _meta() -> dict:
    return {
        "live": True,
        "stale": False,
        "generated_at": datetime.now(UTC).isoformat(),
        "sources": [SRC["atmos"].src(kind="derived").model_dump()],
    }


def _scope_sql(scope: str, geom: str, city: str, country: str) -> str:
    if scope == "area":
        return f"{geom} IS NOT NULL AND ST_DWithin({geom}, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, {AREA_M})"
    if scope == "city":
        return f"lower({city}) = lower(:city)"
    return f"{country} = :country"


async def _activity(db: AsyncSession, user_ids: list[uuid.UUID], since: datetime | None) -> dict:
    if not user_ids:
        return {}
    q = (
        select(
            Action.user_id,
            func.coalesce(func.sum(Action.quantity).filter(Action.action_type == "plant_tree"), 0),
            func.coalesce(func.sum(Action.cooling_c), 0),
        )
        .where(Action.user_id.in_(user_ids), Action.status == "verified")
        .group_by(Action.user_id)
    )
    if since:
        q = q.where(Action.verified_at >= since)
    return {r[0]: (int(r[1]), round(float(r[2]), 4)) for r in (await db.execute(q)).all()}


async def _users(db, viewer, scope, since, where, demo):
    cond = _scope_sql(scope, "p.home_geom", "p.city", "p.country_code")
    sql = (
        "WITH pts AS (SELECT user_id, sum(amount) AS points FROM points_ledger WHERE state IN ('pending','spendable','spent')"
        + (" AND earned_at >= :since" if since else "")
        + " GROUP BY user_id HAVING sum(amount) > 0) "
        "SELECT u.id, pts.points FROM pts JOIN users u ON u.id = pts.user_id JOIN profiles p ON p.user_id = u.id "
        f"WHERE u.is_demo = :demo AND NOT u.blocked AND u.deleted_at IS NULL AND u.role <> 'guest' AND {cond} "
        "ORDER BY pts.points DESC, u.created_at"
    )
    params = {
        "demo": demo,
        "lat": where["lat"],
        "lng": where["lng"],
        "city": where["city"],
        "country": where["country"],
        **({"since": since} if since else {}),
    }
    ranked = (await db.execute(text(sql), _p(sql, params))).all()
    top = ranked[:TOP]
    ids = [r[0] for r in top]
    me_rank = next((i + 1 for i, r in enumerate(ranked) if viewer is not None and r[0] == viewer.id), None)
    if viewer is not None and me_rank and viewer.id not in ids:
        ids.append(viewer.id)
    cards = await people.cards(db, ids, viewer)
    act = await _activity(db, ids, since)
    pts = {r[0]: int(r[1]) for r in ranked}

    def row(uid, rank):
        c = cards.get(uid, {})
        trees, cool = act.get(uid, (0, 0.0))
        return {
            "rank": rank,
            "id": str(uid),
            "name": c.get("display_name", ""),
            "points": pts.get(uid, 0),
            "trees": trees,
            "cooling_c": cool,
            "is_me": viewer is not None and uid == viewer.id,
            "avatar_url": c.get("avatar_url"),
            "href": {"screen": "user", "id": str(uid)},
        }

    rows = [row(uid, i + 1) for i, (uid, _) in enumerate(top)]
    me = row(viewer.id, me_rank) if viewer is not None and me_rank else None
    return rows, me


async def _teams_or_orgs(db, viewer, subject, scope, since, where, demo):
    if subject == "team":
        cond = _scope_sql(scope, "geom", "city", "country")
        sql = f"SELECT id FROM teams WHERE is_demo = :demo AND is_public AND {cond}"  # private teams stay off public boards
        ids = list((await db.execute(text(sql), _p(sql, {"demo": demo, **where}))).scalars().all())
        stats = await team_stats(db, ids, since)
        items = (
            {t.id: t for t in (await db.execute(select(Team).where(Team.id.in_(ids)))).scalars().all()} if ids else {}
        )
        mine = set()
        if viewer is not None:
            from .teams import my_team_ids

            mine = set(await my_team_ids(db, viewer.id))
        ranked = sorted(
            [tid for tid in ids if stats[tid]["points"] > 0],
            key=lambda tid: (-stats[tid]["points"], items[tid].created_at),
        )
        rows = [
            {
                "rank": i + 1,
                "id": str(tid),
                "name": items[tid].name,
                "points": stats[tid]["points"],
                "trees": stats[tid]["trees"],
                "cooling_c": stats[tid]["cooling_c"],
                "is_me": tid in mine,
                "emoji": items[tid].emoji,
                "href": {"screen": "S17", "id": str(tid)},
            }
            for i, tid in enumerate(ranked)
        ]
    else:
        geom = "CASE WHEN o.lat IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(o.lng, o.lat), 4326)::geography END"
        cond = _scope_sql(scope, geom, "o.city", "o.country")
        sql = f"SELECT o.id FROM orgs o WHERE o.is_demo = :demo AND {cond}"
        orgs = list((await db.execute(text(sql), _p(sql, {"demo": demo, **where}))).scalars().all())
        items = (
            {o.id: o for o in (await db.execute(select(Org).where(Org.id.in_(orgs)))).scalars().all()} if orgs else {}
        )
        team_rows = (await db.execute(select(Team.id, Team.org_id).where(Team.org_id.in_(orgs)))).all() if orgs else []
        stats = await team_stats(db, [r[0] for r in team_rows], since)
        agg = {oid: {"points": 0, "trees": 0, "cooling_c": 0.0} for oid in orgs}
        for tid, oid in team_rows:
            for k in agg[oid]:
                agg[oid][k] += stats[tid][k]
        mine = set()
        if viewer is not None:
            from ..models import OrgMember, TeamMember

            mine = set(
                (await db.execute(select(OrgMember.org_id).where(OrgMember.user_id == viewer.id))).scalars().all()
            )
            mine |= set(
                (
                    await db.execute(
                        select(Team.org_id)
                        .join(TeamMember, TeamMember.team_id == Team.id)
                        .where(TeamMember.user_id == viewer.id)
                    )
                )
                .scalars()
                .all()
            )
        ranked = sorted(
            [oid for oid in orgs if agg[oid]["points"] > 0],
            key=lambda oid: (-agg[oid]["points"], items[oid].created_at),
        )
        rows = [
            {
                "rank": i + 1,
                "id": str(oid),
                "name": items[oid].name,
                "points": agg[oid]["points"],
                "trees": agg[oid]["trees"],
                "cooling_c": round(agg[oid]["cooling_c"], 4),
                "is_me": oid in mine,
                "emoji": items[oid].logo_emoji,
                "href": {"screen": "S18", "id": str(oid)},
            }
            for i, oid in enumerate(ranked)
        ]
    me = next((r for r in rows if r["is_me"]), None)
    return rows[:TOP], me
