"""Job queue on Postgres (prompt-v1 §3.1): deduplicated by (kind, key) while queued or running."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Job


async def enqueue(
    db: AsyncSession,
    kind: str,
    key: str,
    payload: dict | None = None,
    *,
    priority: int = 5,
    delay_s: float = 0,
    max_attempts: int = 4,
    total_cells: int = 0,
) -> uuid.UUID:
    """Insert a job unless an identical one is already queued or running; return its id either way."""
    run_after = datetime.now(UTC) + timedelta(seconds=delay_s)
    row = await db.execute(
        text(
            "INSERT INTO jobs (id, kind, key, payload, status, priority, attempts, max_attempts, run_after, progress, total_cells, done_cells, created_at) "
            "VALUES (:id, :kind, :key, CAST(:payload AS jsonb), 'queued', :priority, 0, :max_attempts, :run_after, 0, :total, 0, now()) "
            "ON CONFLICT (kind, key) WHERE status IN ('queued','running') DO NOTHING RETURNING id"
        ),
        {
            "id": uuid.uuid4(),
            "kind": kind,
            "key": key,
            "payload": json.dumps(payload or {}),
            "priority": priority,
            "max_attempts": max_attempts,
            "run_after": run_after,
            "total": total_cells,
        },
    )
    new_id = row.scalar_one_or_none()
    if new_id:
        return new_id
    existing = await db.execute(
        text("SELECT id FROM jobs WHERE kind = :kind AND key = :key AND status IN ('queued','running') LIMIT 1"),
        {"kind": kind, "key": key},
    )
    found = existing.scalar_one_or_none()
    if found:
        return found
    # It finished between the two statements: enqueue again.
    return await enqueue(
        db, kind, key, payload, priority=priority, delay_s=delay_s, max_attempts=max_attempts, total_cells=total_cells
    )


async def claim(db: AsyncSession, kinds: list[str] | None = None) -> Job | None:
    where_kind = "AND kind = ANY(:kinds)" if kinds else ""
    row = await db.execute(
        text(
            "UPDATE jobs SET status = 'running', started_at = now(), attempts = attempts + 1 "
            "WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND run_after <= now() "
            f"{where_kind} ORDER BY priority, created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id"
        ),
        {"kinds": kinds} if kinds else {},
    )
    job_id = row.scalar_one_or_none()
    await db.commit()
    if not job_id:
        return None
    return await db.get(Job, job_id)


async def progress(db: AsyncSession, job_id: uuid.UUID, done: int, total: int) -> None:
    await db.execute(
        text("UPDATE jobs SET done_cells = :d, total_cells = :t, progress = :p WHERE id = :id"),
        {"d": done, "t": total, "p": done / total if total > 0 else 0.0, "id": job_id},
    )
    await db.commit()


async def finish(db: AsyncSession, job_id: uuid.UUID, result: dict | None = None) -> None:
    await db.execute(
        text(
            "UPDATE jobs SET status = 'done', progress = 1, finished_at = now(), result = CAST(:r AS jsonb) WHERE id = :id"
        ),
        {"r": json.dumps(result or {}, default=str), "id": job_id},
    )
    await db.commit()


async def fail(db: AsyncSession, job: Job, error: str, retry_in_s: float | None = None) -> None:
    if job.attempts < job.max_attempts:
        delay = retry_in_s if retry_in_s is not None else min(60 * 2 ** (job.attempts - 1), 3600)
        await db.execute(
            text(
                "UPDATE jobs SET status = 'queued', error = :e, run_after = now() + make_interval(secs => :d) WHERE id = :id"
            ),
            {"e": error[:2000], "d": delay, "id": job.id},
        )
    else:
        await db.execute(
            text("UPDATE jobs SET status = 'failed', error = :e, finished_at = now() WHERE id = :id"),
            {"e": error[:2000], "id": job.id},
        )
    await db.commit()


async def requeue_stale(db: AsyncSession, older_than_min: int = 30) -> int:
    """A crashed worker leaves jobs 'running'; put them back."""
    row = await db.execute(
        text(
            "UPDATE jobs SET status = 'queued', run_after = now() WHERE status = 'running' "
            "AND started_at < now() - make_interval(mins => :m) RETURNING id"
        ),
        {"m": older_than_min},
    )
    n = len(row.all())
    await db.commit()
    return n
