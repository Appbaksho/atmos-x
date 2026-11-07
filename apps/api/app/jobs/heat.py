"""Heat jobs (prompt-v1 §8.7): chunk compute (on demand), region precompute (nightly), zone names."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

import h3
from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import SessionLocal
from ..models import Job, PlaceLabel, PrecomputeRegion, ScanZone
from ..providers import nominatim
from ..services import ecostress as eco
from ..services import heat_pipeline as hp
from ..services import jobs as q
from ..services.conditions_now import today_tmax
from ..worker import Retry, handler

log = logging.getLogger("atmos.jobs.heat")


def zone_label_key(lat: float, lng: float) -> str:
    """Zone names live beside place labels under their own key namespace."""
    return "z:" + h3.latlng_to_cell(lat, lng, 9)


async def _progress_cb(job_id: uuid.UUID):
    async def cb(done: int, total: int) -> None:
        async with SessionLocal() as s:
            await q.progress(s, job_id, done, total)

    return cb


@handler("heat_chunk", concurrency=2)
async def heat_chunk(db: AsyncSession, job: Job) -> dict:
    chunk = job.payload["chunk"]
    cells = hp.chunk_cells(chunk, int(job.payload.get("ring", 1)))
    lat, lng = h3.cell_to_latlng(chunk)
    tmax = await today_tmax(db, lat, lng)
    r = await hp.compute_area(
        db,
        area_kind="chunk",
        area_key=chunk,
        cells=cells,
        tmax_c=tmax,
        progress=await _progress_cb(job.id),
        ecostress=eco.layer if settings.earthdata_enabled else None,
    )
    return {
        "cells": r.cells,
        "satellite": r.satellite,
        "estimate": r.estimate,
        "no_data": r.no_data,
        "timings": r.timings,
    }


@handler("heat_region", concurrency=1)
async def heat_region(db: AsyncSession, job: Job) -> dict:
    reg = await db.get(PrecomputeRegion, job.payload["region"])
    if reg is None:
        return {"skipped": "unknown region"}
    cells = hp.region_cells(reg.south, reg.west, reg.north, reg.east)
    tmax = await today_tmax(db, (reg.south + reg.north) / 2, (reg.west + reg.east) / 2)
    r = await hp.compute_area(
        db,
        area_kind="region",
        area_key=reg.id,
        cells=cells,
        tmax_c=tmax,
        progress=await _progress_cb(job.id),
        ecostress=eco.layer if settings.earthdata_enabled else None,
    )
    reg.last_run_at = datetime.now(UTC)
    reg.last_status = f"ok: {r.satellite} satellite / {r.cells}"
    await db.commit()
    return {
        "cells": r.cells,
        "satellite": r.satellite,
        "estimate": r.estimate,
        "no_data": r.no_data,
        "timings": r.timings,
    }


@handler("name_zones", concurrency=1)
async def name_zones(db: AsyncSession, job: Job) -> dict:
    """Name unnamed zones once (write-once), from Nominatim at street zoom. 1 request/s."""
    scan_id = uuid.UUID(job.payload["scan_id"])
    langs = ["en"] + ([job.payload["lang"]] if job.payload.get("lang") and job.payload["lang"] != "en" else [])
    # Unnamed zones hold {} (never JSON null), so this matches exactly the ones still to name.
    unnamed = text("scan_zones.name = '{}'::jsonb")
    zones = (await db.execute(select(ScanZone).where(ScanZone.scan_id == scan_id, unnamed))).scalars().all()
    named = 0
    for z in zones:
        key = zone_label_key(z.centroid_lat, z.centroid_lng)
        m: dict[str, str] = {}
        rows: list[dict] = []
        for lang in langs:
            r = await nominatim.reverse(z.centroid_lat, z.centroid_lng, lang, zoom=17, timeout=10)
            nm = r.get("near") or r.get("place")
            if nm:
                m[lang] = nm[:120]
                rows.append(
                    {
                        "key": key,
                        "lang": lang,
                        "label": nm[:200],
                        "city": r.get("city"),
                        "country": r.get("country"),
                        "country_code": r.get("country_code"),
                        "source": "zone",
                    }
                )
        if not m:
            continue
        m["default"] = m.get("en") or next(iter(m.values()))
        stmt = pg_insert(PlaceLabel).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["key", "lang"], set_={"label": stmt.excluded.label, "fetched_at": datetime.now(UTC)}
        )
        await db.execute(stmt)
        await db.execute(update(ScanZone).where(ScanZone.id == z.id, unnamed).values(name=m))
        await db.commit()
        named += 1
    if zones and not named:
        raise Retry("no names from Nominatim", delay_s=900)
    return {"named": named, "of": len(zones)}


async def enqueue_regions() -> None:
    async with SessionLocal() as db:
        regs = (await db.execute(select(PrecomputeRegion).where(PrecomputeRegion.enabled.is_(True)))).scalars().all()
        for r in regs:
            await q.enqueue(
                db, "heat_region", f"{r.id}:{datetime.now(UTC).date()}", {"region": r.id}, priority=4, max_attempts=3
            )
        await db.commit()


async def boot_regions() -> None:
    """First boot: precompute any region that has never run."""
    async with SessionLocal() as db:
        regs = (
            (
                await db.execute(
                    select(PrecomputeRegion).where(
                        PrecomputeRegion.enabled.is_(True), PrecomputeRegion.last_run_at.is_(None)
                    )
                )
            )
            .scalars()
            .all()
        )
        for r in regs:
            await q.enqueue(db, "heat_region", f"{r.id}:boot", {"region": r.id}, priority=4, max_attempts=3)
        await db.commit()
