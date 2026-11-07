"""Fixed-window counters in Postgres (`usage_counters`), prompt-v1 §6.2 A8 and §11."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .errors import AppError


def window_start(now: datetime, window_s: int) -> datetime:
    epoch = int(now.timestamp())
    return datetime.fromtimestamp(epoch - epoch % window_s, tz=UTC)


def day_start_local(now: datetime, tz_offset_min: int = 360) -> datetime:
    """Start of the local day (default Asia/Dhaka, UTC+6) in UTC, for daily limits."""
    local = now + timedelta(minutes=tz_offset_min)
    start_local = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_local - timedelta(minutes=tz_offset_min)


async def hit(db: AsyncSession, key: str, start: datetime, amount: int = 1) -> int:
    row = await db.execute(
        text(
            "INSERT INTO usage_counters (key, window_start, count) VALUES (:k, :w, :n) "
            "ON CONFLICT (key, window_start) DO UPDATE SET count = usage_counters.count + :n RETURNING count"
        ),
        {"k": key, "w": start, "n": amount},
    )
    return int(row.scalar_one())


async def peek(db: AsyncSession, key: str, start: datetime) -> int:
    row = await db.execute(
        text("SELECT count FROM usage_counters WHERE key = :k AND window_start = :w"), {"k": key, "w": start}
    )
    v = row.scalar_one_or_none()
    return int(v or 0)


async def limit(db: AsyncSession, key: str, max_count: int, window_s: int, *, code: str = "rate_limited") -> int:
    """Count one hit; raise 429 when over the limit. Commits are the caller's job."""
    now = datetime.now(UTC)
    start = window_start(now, window_s)
    n = await hit(db, key, start)
    if n > max_count:
        retry = int((start + timedelta(seconds=window_s) - now).total_seconds()) + 1
        raise AppError(429, code, "Limit reached, try again later", retry_after=max(retry, 1))
    return n
