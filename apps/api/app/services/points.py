"""Points ledger (prompt-v1 §6.7 PT8–PT10). Append-only; the server is the only writer.

An award is one `earn` row (+amount, pending or spendable). Every later change is a pair of rows with
the same `earn_id`: −amount in the old state, +amount in the new one (unlock, spend, refund, revoke).
Balances are sums by state. Earned points (levels, leaderboards) = awards minus revoked.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, func, select, text  # noqa: F401
from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import AppError
from ..models import PointsLedger

UNLOCK_AFTER = timedelta(days=90)


async def earn(
    db: AsyncSession,
    user_id: uuid.UUID,
    amount: int,
    *,
    rule_id: str,
    source_type: str,
    source_id: str,
    state: str = "pending",
    tree_id: uuid.UUID | None = None,
    unlock_at: datetime | None = None,
    at: datetime | None = None,
) -> PointsLedger | None:
    """Idempotent per (user, rule, source): a second award for the same source is ignored."""
    if amount <= 0:
        return None
    dup = (
        await db.execute(
            select(PointsLedger.id).where(
                PointsLedger.user_id == user_id,
                PointsLedger.kind == "earn",
                PointsLedger.rule_id == rule_id,
                PointsLedger.source_type == source_type,
                PointsLedger.source_id == source_id,
            )
        )
    ).first()
    if dup:
        return None
    now = at or datetime.now(UTC)
    row = PointsLedger(
        id=uuid.uuid4(),
        user_id=user_id,
        amount=amount,
        state=state,
        kind="earn",
        rule_id=rule_id,
        source_type=source_type,
        source_id=source_id,
        tree_id=tree_id,
        earned_at=now,
        unlock_at=unlock_at,
    )
    row.earn_id = row.id
    db.add(row)
    await db.flush()
    return row


async def _net_by_earn(db: AsyncSession, earn_filter) -> list[tuple[uuid.UUID, str, int, datetime]]:
    """For awards matching `earn_filter`, the net amount per state over ALL their rows (incl. spends)."""
    ids = select(PointsLedger.id).where(PointsLedger.kind == "earn", earn_filter).scalar_subquery()
    rows = (
        await db.execute(
            select(
                PointsLedger.earn_id,
                PointsLedger.state,
                func.sum(PointsLedger.amount),
                func.min(PointsLedger.earned_at),
            )
            .where(PointsLedger.earn_id.in_(ids))
            .group_by(PointsLedger.earn_id, PointsLedger.state)
            .having(func.sum(PointsLedger.amount) > 0)
        )
    ).all()
    return [(r[0], r[1], int(r[2]), r[3]) for r in rows]


async def _move(db: AsyncSession, earn_id: uuid.UUID, frm: str, to: str, amount: int, kind: str) -> None:
    base = (await db.execute(select(PointsLedger).where(PointsLedger.id == earn_id))).scalar_one()
    for amt, st in ((-amount, frm), (amount, to)):
        db.add(
            PointsLedger(
                user_id=base.user_id,
                amount=amt,
                state=st,
                kind=kind,
                rule_id=base.rule_id,
                source_type=base.source_type,
                source_id=base.source_id,
                tree_id=base.tree_id,
                earn_id=earn_id,
                earned_at=base.earned_at,
            )
        )
    await db.flush()


async def unlock_tree(db: AsyncSession, tree_id: uuid.UUID) -> int:
    """PT9: the tree's pending points become spendable after its 90-day check-in."""
    rows = await _net_by_earn(db, PointsLedger.tree_id == tree_id)
    n = 0
    for earn_id, st, amt, *_ in rows:
        if st == "pending":
            await _move(db, earn_id, "pending", "spendable", int(amt), "unlock")
            n += int(amt)
    return n


async def unlock_due(db: AsyncSession, now: datetime | None = None) -> int:
    """Non-tree points unlock 90 days after verification (assumption recorded in decisions)."""
    now = now or datetime.now(UTC)
    due = (
        (
            await db.execute(
                select(PointsLedger.id).where(
                    PointsLedger.kind == "earn",
                    PointsLedger.state == "pending",
                    PointsLedger.tree_id.is_(None),
                    PointsLedger.unlock_at.is_not(None),
                    PointsLedger.unlock_at <= now,
                )
            )
        )
        .scalars()
        .all()
    )
    n = 0
    for earn_id in due:
        net = await _net_by_earn(db, PointsLedger.id == earn_id)
        for _, st, amt, *_ in net:
            if st == "pending":
                await _move(db, earn_id, "pending", "spendable", int(amt), "unlock")
                n += int(amt)
    return n


async def revoke_source(db: AsyncSession, source_type: str, source_id: str) -> int:
    """PT10: revoked actions and trees revoke their pending and spendable points."""
    rows = await _net_by_earn(db, and_(PointsLedger.source_type == source_type, PointsLedger.source_id == source_id))
    n = 0
    for earn_id, st, amt, *_ in rows:
        if st in ("pending", "spendable"):
            await _move(db, earn_id, st, "revoked", int(amt), "revoke")
            n += int(amt)
    return n


async def revoke_tree(db: AsyncSession, tree_id: uuid.UUID) -> int:
    rows = await _net_by_earn(db, PointsLedger.tree_id == tree_id)
    n = 0
    for earn_id, st, amt, *_ in rows:
        if st in ("pending", "spendable"):
            await _move(db, earn_id, st, "revoked", int(amt), "revoke")
            n += int(amt)
    return n


async def balances(db: AsyncSession, user_id: uuid.UUID) -> dict:
    rows = (
        await db.execute(
            select(PointsLedger.state, func.sum(PointsLedger.amount))
            .where(PointsLedger.user_id == user_id)
            .group_by(PointsLedger.state)
        )
    ).all()
    b = {"pending": 0, "spendable": 0, "spent": 0, "revoked": 0}
    for st, amt in rows:
        b[st] = int(amt or 0)
    return b


async def earned(db: AsyncSession, user_id: uuid.UUID) -> int:
    b = await balances(db, user_id)
    return b["pending"] + b["spendable"] + b["spent"]


async def next_unlock_at(db: AsyncSession, user_id: uuid.UUID) -> str | None:
    """Earliest time pending points can unlock: a non-tree unlock date, or a tree's 90th day."""
    row = (
        await db.execute(
            text(
                "SELECT min(coalesce(l.unlock_at, t.planted_at + interval '90 days')) FROM points_ledger l "
                "LEFT JOIN trees t ON t.id = l.tree_id WHERE l.user_id = :u AND l.kind = 'earn' AND l.state = 'pending' "
                "AND (SELECT sum(x.amount) FROM points_ledger x WHERE x.earn_id = l.id AND x.state = 'pending') > 0"
            ),
            {"u": user_id},
        )
    ).scalar_one_or_none()
    return row.isoformat() if row else None


async def spend(db: AsyncSession, user_id: uuid.UUID, amount: int, *, source_type: str, source_id: str) -> None:
    """S14: spend spendable points oldest-first, inside the caller's transaction. Never overdraws.

    The caller must hold a row lock that serializes this user's spends (see store service).
    """
    if amount <= 0:
        raise AppError(400, "points.amount", "Nothing to spend")
    rows = [r for r in await _net_by_earn(db, PointsLedger.user_id == user_id) if r[1] == "spendable"]
    avail = sum(int(r[2]) for r in rows)
    if avail < amount:
        raise AppError(409, "points.insufficient", "Not enough spendable points")
    left = amount
    for earn_id, _st, amt, *_ in sorted(rows, key=lambda r: r[3]):
        if left <= 0:
            break
        take = min(int(amt), left)
        base = (await db.execute(select(PointsLedger).where(PointsLedger.id == earn_id))).scalar_one()
        for a, st in ((-take, "spendable"), (take, "spent")):
            db.add(
                PointsLedger(
                    user_id=user_id,
                    amount=a,
                    state=st,
                    kind="spend",
                    rule_id=base.rule_id,
                    source_type=source_type,
                    source_id=source_id,
                    tree_id=base.tree_id,
                    earn_id=earn_id,
                    earned_at=base.earned_at,
                )
            )
        left -= take
    await db.flush()
