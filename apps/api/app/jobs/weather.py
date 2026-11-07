"""Weather and air jobs (prompt-v1 §8.7): POWER, GEOS-FP, GEOS-CF v2, OpenAQ."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Job
from ..services import air, conditions
from ..worker import handler


@handler("power_normal")
async def power_normal(db: AsyncSession, job: Job) -> dict:
    return await conditions.refresh_normal(db, job.payload["lat"], job.payload["lng"])


@handler("power_recent")
async def power_recent(db: AsyncSession, job: Job) -> dict:
    return await conditions.refresh_recent(db, job.payload["lat"], job.payload["lng"])


@handler("geos_fp")
async def geos_fp(db: AsyncSession, job: Job) -> dict:
    return await conditions.refresh_geos_fp(db, job.payload["lat"], job.payload["lng"])


@handler("geos_cf")
async def geos_cf(db: AsyncSession, job: Job) -> dict:
    return await air.refresh_cf(db, job.payload["lat"], job.payload["lng"])


@handler("openaq")
async def openaq(db: AsyncSession, job: Job) -> dict:
    return await air.refresh_stations(db, job.payload["lat"], job.payload["lng"])


@handler("place_label")
async def place_label(db: AsyncSession, job: Job) -> dict:
    """E3: fetch a place name off the request path; the next conditions answer uses the cache."""
    from ..services import geo

    p = job.payload
    r = await geo.reverse(db, p["lat"], p["lng"], p.get("lang", "en"), timeout=10)
    return {"place": r.get("place"), "live": r.get("live")}


@handler("gibs_caps")
async def gibs_caps(db: AsyncSession, job: Job) -> dict:
    from ..services import gibs

    return await gibs.refresh(db)
