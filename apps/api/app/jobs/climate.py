"""History and future-warming jobs (prompt-v1 §8.7): forever caches, low priority."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Job
from ..services import history
from ..worker import handler


@handler("zone_history")
async def zone_history(db: AsyncSession, job: Job) -> dict:
    return await history.compute_history(db, job.payload["chunk"])


@handler("cmip6")
async def cmip6(db: AsyncSession, job: Job) -> dict:
    return await history.compute_cmip6(db, job.payload["lat"], job.payload["lng"])


@handler("imerg")
async def imerg(db: AsyncSession, job: Job) -> dict:
    from ..services import hydro

    return await hydro.refresh_imerg(db, job.payload["lat"], job.payload["lng"])


@handler("smap")
async def smap(db: AsyncSession, job: Job) -> dict:
    from ..services import hydro

    return await hydro.refresh_smap(db, job.payload["lat"], job.payload["lng"])
