"""Teams and organizations (prompt-v1 §6.8 C8, C9). Stats come from the points ledger and verified actions."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import AppError, conflict, forbidden, not_found
from ..models import Action, Goal, Org, OrgMember, Profile, Team, TeamMember, TeamMessage, User
from ..models.community import MAX_TEAM_MEMBERS
from ..ratelimit import limit
from . import people
from .notify import notify
from .profile import point_wkt

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
MAX_TEAMS_PER_USER = 5
ORG_KINDS = ("school", "ngo", "city", "company", "other")


async def _new_code(db: AsyncSession) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not (await db.execute(select(Team.id).where(Team.code == code))).first():
            return code
    raise AppError(500, "team.code", "Could not create a team code")


async def team_points(
    db: AsyncSession, team_ids: list[uuid.UUID], since: datetime | None = None
) -> dict[uuid.UUID, int]:
    """Earned (not revoked) points behind each team's trees and actions."""
    if not team_ids:
        return {}
    sql = (
        "SELECT coalesce(t.team_id, a.team_id) AS team, sum(l.amount) FROM points_ledger l "
        "LEFT JOIN trees t ON t.id = l.tree_id "
        "LEFT JOIN actions a ON l.source_type = 'action' AND a.id::text = l.source_id "
        "WHERE l.state IN ('pending','spendable','spent') AND coalesce(t.team_id, a.team_id) = ANY(:ids)"
        + (" AND l.earned_at >= :since" if since else "")
        + " GROUP BY 1"
    )
    params = {"ids": team_ids, **({"since": since} if since else {})}
    return {r[0]: int(r[1] or 0) for r in (await db.execute(text(sql), params)).all()}


async def team_stats(
    db: AsyncSession, team_ids: list[uuid.UUID], since: datetime | None = None
) -> dict[uuid.UUID, dict]:
    pts = await team_points(db, team_ids, since)
    q = (
        select(
            Action.team_id,
            func.count(),
            func.coalesce(func.sum(Action.quantity).filter(Action.action_type == "plant_tree"), 0),
            func.coalesce(func.sum(Action.cooling_c), 0),
        )
        .where(Action.team_id.in_(team_ids), Action.status == "verified")
        .group_by(Action.team_id)
    )
    if since:
        q = q.where(Action.verified_at >= since)
    acts = {r[0]: r for r in (await db.execute(q)).all()}
    out = {}
    for tid in team_ids:
        a = acts.get(tid)
        out[tid] = {
            "points": pts.get(tid, 0),
            "trees": int(a[2]) if a else 0,
            "actions": int(a[1]) if a else 0,
            "cooling_c": round(float(a[3]), 4) if a else 0.0,
        }
    return out


async def user_points(
    db: AsyncSession, user_ids: list[uuid.UUID], since: datetime | None = None
) -> dict[uuid.UUID, int]:
    if not user_ids:
        return {}
    sql = (
        "SELECT user_id, sum(amount) FROM points_ledger WHERE state IN ('pending','spendable','spent') AND user_id = ANY(:ids)"
        + (" AND earned_at >= :since" if since else "")
        + " GROUP BY 1"
    )
    return {
        r[0]: int(r[1] or 0)
        for r in (await db.execute(text(sql), {"ids": user_ids, **({"since": since} if since else {})})).all()
    }


async def my_team_ids(db: AsyncSession, user_id: uuid.UUID) -> list[uuid.UUID]:
    return list((await db.execute(select(TeamMember.team_id).where(TeamMember.user_id == user_id))).scalars().all())


async def team_out(db: AsyncSession, t: Team, viewer: User | None, *, full: bool = True) -> dict:
    members = (
        (await db.execute(select(TeamMember).where(TeamMember.team_id == t.id).order_by(TeamMember.joined_at)))
        .scalars()
        .all()
    )
    ids = [m.user_id for m in members]
    cards = await people.cards(db, ids, viewer)
    upts = await user_points(db, ids)
    stats = (await team_stats(db, [t.id]))[t.id]
    me = next((m for m in members if viewer is not None and m.user_id == viewer.id), None)
    org = await db.get(Org, t.org_id) if t.org_id else None
    out = {
        "id": str(t.id),
        "name": t.name,
        "code": t.code if me else None,
        "description": t.description,
        "org_id": str(t.org_id) if t.org_id else None,
        "org_name": org.name if org else None,
        "owner_id": str(t.owner_id),
        "max_members": t.max_members,
        "is_public": t.is_public,
        "area": t.area,
        "city": t.city,
        "country": t.country,
        "emoji": t.emoji,
        "goal_id": str(t.goal_id) if t.goal_id else None,
        "is_demo": t.is_demo,
        "members": [
            {
                "user_id": str(m.user_id),
                "role": m.role,
                "points": upts.get(m.user_id, 0),
                **{k: v for k, v in cards.get(m.user_id, {}).items() if k != "id"},
            }
            for m in members
        ],
        "stats": stats,
        "is_member": me is not None,
        "my_role": me.role if me else None,
        "full": len(members) >= t.max_members,
    }
    if full:
        rows = (
            (
                await db.execute(
                    select(Action)
                    .where(Action.team_id == t.id, Action.status == "verified")
                    .order_by(Action.verified_at.desc())
                    .limit(10)
                )
            )
            .scalars()
            .all()
        )
        ac = await people.cards(db, {a.user_id for a in rows}, viewer)
        out["activity"] = [
            {
                "id": str(a.id),
                "user_id": str(a.user_id),
                "user_name": ac.get(a.user_id, {}).get("display_name", ""),
                "action_type": a.action_type,
                "quantity": a.quantity,
                "points": a.points,
                "created_at": (a.verified_at or a.created_at).isoformat(),
            }
            for a in rows
        ]
        goal = await db.get(Goal, t.goal_id) if t.goal_id else None
        if goal is None:
            goal = (
                await db.execute(
                    select(Goal)
                    .where(Goal.team_id == t.id, Goal.status != "archived")
                    .order_by((Goal.status == "active").desc(), Goal.created_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
        if goal is not None:
            from . import goals as G

            p = await G.progress(db, goal)
            out["goal"] = {
                "id": str(goal.id),
                "zone_name": goal.zone_name,
                "target_c": goal.target_c,
                "by_date": goal.by_date.isoformat(),
                "progress_pct": p["pct"],
                "kind": goal.kind,
            }
        else:
            out["goal"] = None
    return out


async def get_team(db: AsyncSession, team_id: uuid.UUID) -> Team:
    t = await db.get(Team, team_id)
    if t is None:
        raise not_found("team.not_found", "Team not found")
    return t


async def create(
    db: AsyncSession,
    user: User,
    *,
    name: str,
    description: str | None,
    is_public: bool,
    emoji: str | None,
    org_id: uuid.UUID | None,
    max_members: int,
) -> Team:
    if len(await my_team_ids(db, user.id)) >= MAX_TEAMS_PER_USER:
        raise conflict("team.too_many", f"You can be in up to {MAX_TEAMS_PER_USER} teams")
    if org_id is not None and await db.get(Org, org_id) is None:
        raise not_found("org.not_found", "Organization not found")
    prof = await db.get(Profile, user.id)
    t = Team(
        name=name.strip()[:80],
        code=await _new_code(db),
        description=(description or "").strip()[:500] or None,
        org_id=org_id,
        owner_id=user.id,
        max_members=max(2, min(MAX_TEAM_MEMBERS, max_members)),
        is_public=is_public,
        area=prof.area if prof else None,
        city=prof.city if prof else None,
        country=prof.country_code if prof else None,
        lat=prof.home_lat if prof else None,
        lng=prof.home_lng if prof else None,
        geom=point_wkt(prof.home_lat, prof.home_lng) if prof and prof.home_lat is not None else None,
        emoji=(emoji or "🌳")[:8],
        is_demo=user.is_demo,
    )
    db.add(t)
    await db.flush()
    db.add(TeamMember(team_id=t.id, user_id=user.id, role="lead"))
    await db.commit()
    return t


async def join(db: AsyncSession, user: User, t: Team, *, by_code: bool) -> Team:
    await limit(db, f"team_join:{user.id}", 5, 3600, code="team.join_limit")
    await db.commit()
    if not by_code and not t.is_public:
        raise forbidden("team.private", "This team joins by invite code only")
    if (await db.execute(select(TeamMember).where(TeamMember.team_id == t.id, TeamMember.user_id == user.id))).first():
        return t
    if len(await my_team_ids(db, user.id)) >= MAX_TEAMS_PER_USER:
        raise conflict("team.too_many", f"You can be in up to {MAX_TEAMS_PER_USER} teams")
    n = (await db.execute(select(func.count()).select_from(TeamMember).where(TeamMember.team_id == t.id))).scalar_one()
    if n >= t.max_members:
        raise conflict("team.full", "This team is full")
    db.add(TeamMember(team_id=t.id, user_id=user.id, role="member"))
    await notify(
        db,
        t.owner_id,
        "team_invite",
        {"code": "notif.team.member_joined", "params": {"who": user.display_name, "team": t.name}},
        screen="S17",
        params={"id": str(t.id)},
        dedupe_key=f"team:{t.id}:joined:{user.id}",
    )
    await db.commit()
    return t


async def by_code(db: AsyncSession, code: str) -> Team:
    t = (await db.execute(select(Team).where(Team.code == code.strip().upper()))).scalar_one_or_none()
    if t is None:
        raise not_found("team.code_not_found", "No team has that code")
    return t


async def leave(db: AsyncSession, user: User, t: Team) -> None:
    me = (
        await db.execute(select(TeamMember).where(TeamMember.team_id == t.id, TeamMember.user_id == user.id))
    ).scalar_one_or_none()
    if me is None:
        return
    await db.delete(me)
    await db.flush()
    rest = (
        (await db.execute(select(TeamMember).where(TeamMember.team_id == t.id).order_by(TeamMember.joined_at)))
        .scalars()
        .all()
    )
    if not rest:
        await db.execute(delete(TeamMessage).where(TeamMessage.team_id == t.id))
        await db.delete(t)
    elif me.role == "lead" and not any(m.role == "lead" for m in rest):
        rest[0].role = "lead"
        t.owner_id = rest[0].user_id
    await db.commit()


async def patch(db: AsyncSession, user: User, t: Team, data: dict) -> Team:
    me = (
        await db.execute(select(TeamMember).where(TeamMember.team_id == t.id, TeamMember.user_id == user.id))
    ).scalar_one_or_none()
    if me is None or me.role != "lead":
        raise forbidden("team.not_lead", "Only a team lead can change the team")
    if "org_id" in data and data["org_id"] is not None and await db.get(Org, data["org_id"]) is None:
        raise not_found("org.not_found", "Organization not found")
    if "goal_id" in data and data["goal_id"] is not None:
        g = await db.get(Goal, data["goal_id"])
        if g is None or g.team_id != t.id:
            raise AppError(400, "team.goal", "Pick one of this team's goals")
    for k in ("name", "description", "is_public", "emoji", "org_id", "goal_id"):
        if k in data:
            setattr(t, k, data[k])
    await db.commit()
    return t


async def messages(db: AsyncSession, t: Team, viewer: User, since: datetime | None) -> list[dict]:
    q = select(TeamMessage).where(TeamMessage.team_id == t.id)
    if since:
        q = q.where(TeamMessage.created_at > since).order_by(TeamMessage.created_at).limit(200)
        rows = list((await db.execute(q)).scalars().all())
    else:
        rows = list(reversed((await db.execute(q.order_by(TeamMessage.created_at.desc()).limit(50))).scalars().all()))
    cards = await people.cards(db, {m.user_id for m in rows}, viewer)
    return [
        {
            "id": str(m.id),
            "user": cards.get(m.user_id),
            "body": m.body,
            "mine": m.user_id == viewer.id,
            "created_at": m.created_at.isoformat(),
        }
        for m in rows
    ]


async def post_message(db: AsyncSession, t: Team, user: User, body: str) -> dict:
    await limit(db, f"team_msg:{user.id}", 20, 60, code="team.chat_limit")
    m = TeamMessage(team_id=t.id, user_id=user.id, body=body.strip()[:1000])
    db.add(m)
    await db.commit()
    await db.refresh(m)
    card = (await people.cards(db, {user.id}, user)).get(user.id)
    return {"id": str(m.id), "user": card, "body": m.body, "mine": True, "created_at": m.created_at.isoformat()}


async def is_member(db: AsyncSession, t: Team, user: User | None) -> bool:
    if user is None:
        return False
    return bool(
        (
            await db.execute(
                select(TeamMember.user_id).where(TeamMember.team_id == t.id, TeamMember.user_id == user.id)
            )
        ).first()
    )


# ── organizations ───────────────────────────────────────────────────────────


async def org_out(db: AsyncSession, o: Org, viewer: User | None) -> dict:
    teams = (await db.execute(select(Team).where(Team.org_id == o.id).order_by(Team.created_at))).scalars().all()
    stats = await team_stats(db, [t.id for t in teams])
    members = (
        (
            await db.execute(
                select(func.count(func.distinct(TeamMember.user_id))).where(
                    TeamMember.team_id.in_([t.id for t in teams])
                )
            )
        ).scalar_one()
        if teams
        else 0
    )
    goals = []
    if teams:
        from . import goals as G

        for g in (
            (await db.execute(select(Goal).where(Goal.team_id.in_([t.id for t in teams]), Goal.status == "active")))
            .scalars()
            .all()
        ):
            p = await G.progress(db, g)
            goals.append(
                {
                    "zone_name": g.zone_name,
                    "target_c": g.target_c,
                    "by_date": g.by_date.isoformat(),
                    "progress_pct": p["pct"],
                }
            )
    tot = {
        "points": sum(s["points"] for s in stats.values()),
        "trees": sum(s["trees"] for s in stats.values()),
        "members": int(members),
        "cooling_c": round(sum(s["cooling_c"] for s in stats.values()), 4),
    }
    my = None
    if viewer is not None:
        my = (
            await db.execute(select(OrgMember.role).where(OrgMember.org_id == o.id, OrgMember.user_id == viewer.id))
        ).scalar_one_or_none()
    return {
        "id": str(o.id),
        "name": o.name,
        "kind": o.kind,
        "city": o.city,
        "country": o.country,
        "verified": o.verified,
        "description": o.description,
        "logo_emoji": o.logo_emoji,
        "is_demo": o.is_demo,
        "teams": [{"id": str(t.id), "name": t.name, "emoji": t.emoji, "stats": stats[t.id]} for t in teams],
        "totals": tot,
        "goals": goals,
        "my_role": my,
    }


async def create_org(
    db: AsyncSession,
    user: User,
    *,
    name: str,
    kind: str,
    city: str | None,
    country: str | None,
    description: str | None,
    logo_emoji: str | None,
) -> Org:
    if kind not in ORG_KINDS:
        raise AppError(400, "org.kind", "Pick school, NGO, city, company or other")
    await limit(db, f"org_create:{user.id}", 3, 86400, code="org.create_limit")
    o = Org(
        name=name.strip()[:120],
        kind=kind,
        city=city,
        country=(country or "").upper()[:2] or None,
        description=description,
        logo_emoji=logo_emoji or "🏫",
        created_by=user.id,
        is_demo=user.is_demo,
    )
    db.add(o)
    await db.flush()
    db.add(OrgMember(org_id=o.id, user_id=user.id, role="admin"))
    await db.commit()
    return o


async def team_goal_reached(db: AsyncSession, goal: Goal) -> int:
    """PT6: when a team goal reaches 100 %, each member earns 100 (once). Returns members awarded."""
    if goal.team_id is None:
        return 0
    from . import goals as G
    from . import points as PTS

    if (await G.progress(db, goal))["pct"] < 100:
        return 0
    t = await db.get(Team, goal.team_id)
    n = 0
    for uid in (await db.execute(select(TeamMember.user_id).where(TeamMember.team_id == goal.team_id))).scalars().all():
        r = await PTS.earn(
            db, uid, 100, rule_id="PT6", source_type="team_goal", source_id=str(goal.id), state="spendable"
        )
        if r:
            n += 1
            from . import badges as B

            await B.evaluate(db, uid)
            await notify(
                db,
                uid,
                "goal_progress",
                {
                    "code": "notif.team.goal_reached",
                    "params": {"team": t.name if t else "", "zone": goal.zone_name or ""},
                },
                screen="S17",
                params={"id": str(goal.team_id)},
                dedupe_key=f"team_goal:{goal.id}",
            )
    if n and goal.status == "active":
        goal.status = "done"
    return n


_ = datetime, UTC
