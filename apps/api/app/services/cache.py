"""Provider cache in `data_cache` (prompt-v1 §8.8): fresh within TTL, last-good served as stale."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..http import UpstreamError
from ..models import DataCache


@dataclass
class Cached:
    value: Any
    fresh: bool
    fetched_at: datetime
    as_of: str | None

    @property
    def stale(self) -> bool:
        return not self.fresh


async def read(db: AsyncSession, key: str) -> DataCache | None:
    return await db.get(DataCache, key)


async def write(db: AsyncSession, key: str, source: str, value: Any, ttl: timedelta, as_of: str | None = None) -> None:
    now = datetime.now(UTC)
    stmt = insert(DataCache).values(
        key=key, source=source, value=value, as_of=as_of, fetched_at=now, expires_at=now + ttl
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["key"],
        set_={
            "value": stmt.excluded.value,
            "as_of": stmt.excluded.as_of,
            "fetched_at": now,
            "expires_at": stmt.excluded.expires_at,
            "source": source,
        },
    )
    await db.execute(stmt)
    await db.commit()


async def cached(
    db: AsyncSession,
    key: str,
    source: str,
    ttl: timedelta,
    fetcher: Callable[[], Awaitable[Any]],
    *,
    stale_for: timedelta | None = None,
    as_of: Callable[[Any], str | None] | None = None,
) -> Cached:
    """Fresh row → return it. Else fetch; on upstream failure fall back to the last good value
    (if younger than `stale_for`, when given). Raises UpstreamError when there is nothing to serve."""
    row = await read(db, key)
    now = datetime.now(UTC)
    if row is not None and row.expires_at > now:
        return Cached(row.value, True, row.fetched_at, row.as_of)
    try:
        value = await fetcher()
    except UpstreamError:
        if row is not None and (stale_for is None or now - row.fetched_at <= stale_for):
            return Cached(row.value, False, row.fetched_at, row.as_of)
        raise
    a = as_of(value) if as_of else None
    await write(db, key, source, value, ttl, a)
    return Cached(value, True, now, a)


async def peek(db: AsyncSession, key: str) -> Cached | None:
    row = await read(db, key)
    if row is None:
        return None
    return Cached(row.value, row.expires_at > datetime.now(UTC), row.fetched_at, row.as_of)


async def purge_expired(db: AsyncSession, older_than: timedelta = timedelta(days=60)) -> int:
    r = await db.execute(
        text("DELETE FROM data_cache WHERE expires_at < now() - make_interval(secs => :s) RETURNING key"),
        {"s": older_than.total_seconds()},
    )
    n = len(r.all())
    await db.commit()
    return n
