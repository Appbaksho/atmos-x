"""Badges (prompt-v1 §6.7 B1–B8), table-driven, evaluated on writes and by the daily job."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..engines.progress import badge_earned
from ..models import Badge, UserBadge
from . import points as PTS
from .notify import notify


async def facts(db: AsyncSession, user_id: uuid.UUID) -> dict:
    q = lambda sql: db.execute(text(sql), {"u": user_id})  # noqa: E731
    trees_verified = (
        await q(
            "SELECT count(*) FROM trees t JOIN actions a ON a.id = t.action_id WHERE t.user_id = :u AND a.status = 'verified' AND NOT t.revoked"
        )
    ).scalar_one()
    trees_alive = (
        await q(
            "SELECT count(*) FROM trees t LEFT JOIN actions a ON a.id = t.action_id WHERE t.user_id = :u AND NOT t.revoked AND NOT t.lost_confirmed "
            "AND (a.id IS NULL OR a.status = 'verified') AND coalesce((SELECT c.health FROM tree_checks c WHERE c.tree_id = t.id ORDER BY c.created_at DESC LIMIT 1), 'healthy') <> 'dead'"
        )
    ).scalar_one()
    d90 = (await q("SELECT count(*) FROM trees WHERE user_id = :u AND milestones ? 'd90'")).scalar_one()
    y1 = (await q("SELECT count(*) FROM trees WHERE user_id = :u AND milestones ? 'y1'")).scalar_one()
    months = [
        r[0]
        for r in (
            await q(
                "SELECT DISTINCT extract(month FROM t.planted_at)::int FROM trees t JOIN actions a ON a.id = t.action_id WHERE t.user_id = :u AND a.status = 'verified'"
            )
        ).all()
    ]
    roof = (
        await q(
            "SELECT coalesce(sum(quantity), 0) * 10 FROM actions WHERE user_id = :u AND action_type = 'cool_roof' AND status = 'verified'"
        )
    ).scalar_one()
    team_goals = (
        await q("SELECT count(*) FROM points_ledger WHERE user_id = :u AND kind = 'earn' AND rule_id = 'PT6'")
    ).scalar_one()
    rows = (
        (await q("SELECT on_time FROM tree_checks WHERE user_id = :u ORDER BY created_at DESC LIMIT 50"))
        .scalars()
        .all()
    )
    streak = 0
    for ok in rows:
        if not ok:
            break
        streak += 1
    return {
        "trees_verified": trees_verified,
        "trees_alive": trees_alive,
        "milestone_d90": d90,
        "milestone_y1": y1,
        "planted_months": months,
        "roof_m2_verified": float(roof),
        "team_goals_reached": team_goals,
        "ontime_streak": streak,
        "points_earned": await PTS.earned(db, user_id),
    }


async def evaluate(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    f = await facts(db, user_id)
    have = set((await db.execute(select(UserBadge.badge_id).where(UserBadge.user_id == user_id))).scalars().all())
    new = []
    for b in (await db.execute(select(Badge).order_by(Badge.position))).scalars().all():
        if b.id in have or not badge_earned(b.rule, f):
            continue
        await db.execute(insert(UserBadge).values(user_id=user_id, badge_id=b.id, source={}).on_conflict_do_nothing())
        await notify(
            db,
            user_id,
            "badge",
            {"code": "notif.badge", "params": {"badge": b.code}},
            screen="S20",
            dedupe_key=f"badge:{b.id}",
        )
        new.append(b.id)
    return new


async def list_for(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    have = dict(
        (await db.execute(select(UserBadge.badge_id, UserBadge.earned_at).where(UserBadge.user_id == user_id))).all()
    )
    out = []
    for b in (await db.execute(select(Badge).order_by(Badge.position))).scalars().all():
        out.append(
            {
                "id": b.id,
                "emoji": b.emoji,
                "code": b.code,
                "earned": b.id in have,
                "earned_at": have[b.id].isoformat() if b.id in have else None,
            }
        )
    return out


_ = func
