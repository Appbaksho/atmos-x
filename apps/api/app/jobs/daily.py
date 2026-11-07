"""Daily people jobs (prompt-v1 §6.7 PT11): unlock points, tree reminders, badges."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import SessionLocal
from ..engines import trees as TR
from ..models import Job, Tree
from ..services import badges as B
from ..services import jobs as q
from ..services import points as PTS
from ..services.notify import notify
from ..worker import handler


@handler("points_unlock")
async def points_unlock(db: AsyncSession, job: Job) -> dict:
    """Non-tree points unlock 90 days after verification (tree points unlock at the 90-day check-in)."""
    n = await PTS.unlock_due(db)
    await db.commit()
    return {"unlocked": n}


@handler("tree_reminders")
async def tree_reminders(db: AsyncSession, job: Job) -> dict:
    """One reminder per due date; a 90-day nudge; an 'at risk' nudge once a tree is 15+ days overdue."""
    now = datetime.now(UTC)
    soon = now + timedelta(days=TR.CFG["due_within_days"])
    rows = (
        (
            await db.execute(
                select(Tree).where(
                    Tree.revoked.is_(False),
                    Tree.lost_confirmed.is_(False),
                    Tree.next_due_at <= soon,
                    Tree.next_due_at >= now - timedelta(days=TR.CFG["lost_overdue_days"]),
                )
            )
        )
        .scalars()
        .all()
    )
    sent = 0
    for t in rows:
        due = t.next_due_at.date().isoformat()
        overdue = (now - t.next_due_at).days
        if overdue > TR.CFG["at_risk_overdue_days"]:
            code, key = "notif.tree.at_risk", f"tree:{t.id}:risk:{due}"
        else:
            code, key = "notif.tree.due", f"tree:{t.id}:due:{due}"
        await notify(
            db,
            t.user_id,
            "tree_due",
            {"code": code, "params": {"name": t.nickname, "date": due}},
            screen="S20",
            params={"tree_id": str(t.id)},
            dedupe_key=key,
        )
        sent += 1
    # The 90-day check-in unlocks the tree's points: remind a few days ahead.
    d90 = (
        (
            await db.execute(
                select(Tree).where(
                    Tree.revoked.is_(False),
                    Tree.action_id.is_not(None),
                    Tree.planted_at <= now - timedelta(days=TR.CFG["milestone_d90"] - 3),
                    Tree.planted_at >= now - timedelta(days=TR.CFG["milestone_d90"] + 30),
                    text("NOT (trees.milestones ? 'd90')"),
                )
            )
        )
        .scalars()
        .all()
    )
    for t in d90:
        await notify(
            db,
            t.user_id,
            "tree_due",
            {"code": "notif.tree.d90_due", "params": {"name": t.nickname}},
            screen="S20",
            params={"tree_id": str(t.id)},
            dedupe_key=f"tree:{t.id}:d90due",
        )
        sent += 1
    await db.commit()
    return {"notified": sent}


@handler("badges_daily")
async def badges_daily(db: AsyncSession, job: Job) -> dict:
    """Re-evaluate badges for people active in the last two days (writes evaluate too)."""
    ids = (
        (
            await db.execute(
                text(
                    "SELECT DISTINCT user_id FROM points_ledger WHERE created_at > now() - interval '2 days' "
                    "UNION SELECT DISTINCT user_id FROM tree_checks WHERE created_at > now() - interval '2 days'"
                )
            )
        )
        .scalars()
        .all()
    )
    n = 0
    for uid in ids:
        n += len(await B.evaluate(db, uid))
    await db.commit()
    return {"users": len(ids), "awarded": n}


async def enqueue_daily() -> None:
    day = datetime.now(UTC).date().isoformat()
    async with SessionLocal() as db:
        for kind in ("points_unlock", "tree_reminders", "badges_daily"):
            await q.enqueue(db, kind, day, {}, priority=6, max_attempts=3)
        await db.commit()
