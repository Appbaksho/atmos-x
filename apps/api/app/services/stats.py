"""GET /me/stats: points (from the ledger), level, badges, trees, actions, cooling and area rank."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..engines.progress import level_for
from ..models import Profile, User
from . import badges as B
from . import points as PTS


async def rank_in_area(db: AsyncSession, user: User) -> dict | None:
    """Rank by verified (earned, not revoked) points among people who set the same area."""
    prof = await db.get(Profile, user.id)
    if prof is None or not (prof.area or "").strip():
        return None
    rows = (
        await db.execute(
            text(
                "WITH pts AS (SELECT p.user_id, coalesce(sum(l.amount) FILTER (WHERE l.state IN ('pending','spendable','spent')), 0) AS pts "
                "FROM profiles p JOIN users u ON u.id = p.user_id LEFT JOIN points_ledger l ON l.user_id = p.user_id "
                "WHERE lower(p.area) = lower(:area) AND u.role <> 'guest' AND NOT u.blocked AND u.deleted_at IS NULL GROUP BY p.user_id) "
                "SELECT (SELECT count(*) FROM pts WHERE pts > (SELECT pts FROM pts WHERE user_id = :u)) + 1, (SELECT count(*) FROM pts)"
            ),
            {"area": prof.area.strip(), "u": user.id},
        )
    ).one()
    return {"area": prof.area.strip(), "rank": int(rows[0]), "of": int(rows[1])}


async def stats(db: AsyncSession, user: User) -> dict:
    f = await B.facts(db, user.id)
    bal = await PTS.balances(db, user.id)
    earned = bal["pending"] + bal["spendable"] + bal["spent"]
    q = lambda sql: db.execute(text(sql), {"u": user.id})  # noqa: E731
    trees = (await q("SELECT count(*) FROM trees WHERE user_id = :u AND NOT revoked")).scalar_one()
    actions = (await q("SELECT count(*) FROM actions WHERE user_id = :u AND status = 'verified'")).scalar_one()
    pending_actions = (await q("SELECT count(*) FROM actions WHERE user_id = :u AND status = 'pending'")).scalar_one()
    cooling = (
        await q("SELECT coalesce(sum(cooling_c), 0) FROM actions WHERE user_id = :u AND status = 'verified'")
    ).scalar_one()
    return {
        "points": {
            "earned": earned,
            "spendable": bal["spendable"],
            "pending": bal["pending"],
            "spent": bal["spent"],
            "next_unlock_at": await PTS.next_unlock_at(db, user.id),
        },
        "level": level_for(earned),
        "badges": await B.list_for(db, user.id),
        "trees": int(trees),
        "trees_alive": int(f["trees_alive"]),
        "actions": int(actions),
        "actions_pending": int(pending_actions),
        "cooling_c": round(float(cooling), 4),
        "streak": int(f["ontime_streak"]),
        "rank_area": await rank_in_area(db, user),
    }
