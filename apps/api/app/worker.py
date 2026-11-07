"""Worker (prompt-v1 §8.7): runs queued jobs and the schedule. `python -m app.worker`.

Same code base as the API. Jobs are claimed with FOR UPDATE SKIP LOCKED, so several workers can
run safely. Per-kind concurrency keeps one job at a time per upstream host (§5.2 rate limits).
"""

from __future__ import annotations

import asyncio
import logging
import signal
import traceback
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from . import logs
from .config import settings
from .db import SessionLocal
from .http import UpstreamError, aclose
from .models import Job
from .services import jobs as q

log = logging.getLogger("atmos.worker")

Handler = Callable[[AsyncSession, Job], Awaitable[dict | None]]
HANDLERS: dict[str, Handler] = {}
# Max concurrent jobs per kind (default 1).
CONCURRENCY: dict[str, int] = {}


def handler(kind: str, concurrency: int = 1):
    def deco(fn: Handler) -> Handler:
        HANDLERS[kind] = fn
        CONCURRENCY[kind] = concurrency
        return fn

    return deco


class Retry(Exception):
    """Raise from a handler to retry later without counting as a crash."""

    def __init__(self, message: str, delay_s: float = 300):
        super().__init__(message)
        self.delay_s = delay_s


async def heartbeat() -> None:
    async with SessionLocal() as db:
        await db.execute(
            text(
                "INSERT INTO data_cache (key, source, value, fetched_at, expires_at) VALUES ('worker:heartbeat', 'worker', '{}'::jsonb, now(), now() + interval '1 day') "
                "ON CONFLICT (key) DO UPDATE SET fetched_at = now(), expires_at = now() + interval '1 day'"
            )
        )
        await db.commit()


async def run_one(job: Job) -> None:
    fn = HANDLERS.get(job.kind)
    async with SessionLocal() as db:
        if fn is None:
            await q.fail(db, job, f"no handler for {job.kind}", retry_in_s=3600)
            return
        t0 = datetime.now(UTC)
        try:
            result = await fn(db, job)
            await q.finish(db, job.id, result)
            log.info(
                "job done",
                extra={
                    "data": {
                        "job": str(job.id),
                        "kind": job.kind,
                        "key": job.key,
                        "s": (datetime.now(UTC) - t0).total_seconds(),
                    }
                },
            )
        except Retry as e:
            await db.rollback()
            await q.fail(db, job, str(e), retry_in_s=e.delay_s)
            log.warning("job retry", extra={"data": {"job": str(job.id), "kind": job.kind, "why": str(e)}})
        except UpstreamError as e:
            await db.rollback()
            await q.fail(db, job, str(e), retry_in_s=e.retry_after)
            log.warning("job upstream error", extra={"data": {"job": str(job.id), "kind": job.kind, "why": str(e)}})
        except Exception as e:
            await db.rollback()
            await q.fail(db, job, f"{type(e).__name__}: {e}\n{traceback.format_exc()[-1500:]}")
            log.exception("job failed", extra={"data": {"job": str(job.id), "kind": job.kind}})


class Runner:
    def __init__(self, slots: int = 3):
        self.slots = slots
        self.running: dict[str, int] = {}
        self.tasks: set[asyncio.Task] = set()
        self.stop = asyncio.Event()

    def _free_kinds(self) -> list[str]:
        return [k for k in HANDLERS if self.running.get(k, 0) < CONCURRENCY.get(k, 1)]

    async def loop(self) -> None:
        while not self.stop.is_set():
            if len(self.tasks) >= self.slots:
                await asyncio.sleep(0.5)
                continue
            kinds = self._free_kinds()
            job = None
            if kinds:
                async with SessionLocal() as db:
                    job = await q.claim(db, kinds)
            if job is None:
                try:
                    await asyncio.wait_for(self.stop.wait(), timeout=2.0)
                except TimeoutError:
                    pass
                continue
            self.running[job.kind] = self.running.get(job.kind, 0) + 1
            task = asyncio.create_task(run_one(job))
            self.tasks.add(task)

            def _done(t: asyncio.Task, kind: str = job.kind) -> None:
                self.tasks.discard(t)
                self.running[kind] -= 1

            task.add_done_callback(_done)
        if self.tasks:
            await asyncio.wait(self.tasks, timeout=30)


async def enqueue_now(kind: str, key: str, payload: dict | None = None, priority: int = 5) -> None:
    async with SessionLocal() as db:
        await q.enqueue(db, kind, key, payload, priority=priority)
        await db.commit()


def schedule(sched: AsyncIOScheduler) -> None:
    """Periodic jobs (§8.7). Each enqueues work; the runner executes it."""
    from .jobs import SCHEDULE

    for spec in SCHEDULE:
        sched.add_job(
            spec["fn"],
            spec["trigger"],
            **spec.get("kw", {}),
            id=spec["id"],
            max_instances=1,
            coalesce=True,
            misfire_grace_time=3600,
        )


async def main() -> None:
    logs.setup(settings.log_level)
    settings.validate_for_env()
    from . import jobs as _jobs  # noqa: F401  (registers handlers)

    async with SessionLocal() as db:
        n = await q.requeue_stale(db)
        if n:
            log.warning("requeued stale jobs", extra={"data": {"n": n}})
    await heartbeat()
    sched = AsyncIOScheduler(timezone="UTC")
    schedule(sched)
    sched.add_job(heartbeat, "interval", seconds=60, id="heartbeat")
    sched.start()
    from .jobs import on_boot

    await on_boot()
    runner = Runner(slots=3)
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, runner.stop.set)
    log.info("worker started", extra={"data": {"handlers": sorted(HANDLERS)}})
    try:
        await runner.loop()
    finally:
        sched.shutdown(wait=False)
        await aclose()


def next_run(delta: timedelta) -> datetime:
    return datetime.now(UTC) + delta


if __name__ == "__main__":
    # Run the canonical `app.worker` module, not this `__main__` copy, so handlers registered by
    # `app.jobs` (which import `app.worker`) are the ones the runner sees.
    from app import worker as _canonical

    asyncio.run(_canonical.main())
