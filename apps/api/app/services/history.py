"""20-year hot-season surface temperature per chunk, and future warming (prompt-v1 §7.6).

History: for each year from 2003, the median MOD11A2 day and night LST at the chunk centre in the
three hottest months (from the POWER normal). 1 km context, labelled so. Stored forever per chunk.
Warming: NEX-GDDP-CMIP6 ssp245 ensemble-mean hot-season Tmax delta (2040s vs 1995–2014), cached
forever per 0.25° cell; else the observed MODIS linear trend. Never both (§5.4).
"""

from __future__ import annotations

import asyncio
import logging
import statistics
from datetime import UTC, date, datetime, timedelta

import h3
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..engines import raster as R
from ..engines import weather as W
from ..http import UpstreamError
from ..models import ZoneHistory
from ..providers import cmip6, power
from ..providers import planetary as pc
from ..providers.rasterio_io import read_point
from . import cache
from .conditions import normal_key, refresh_normal

log = logging.getLogger("atmos.history")
FIRST_YEAR = 2003
CMIP6_TTL = timedelta(days=3650)
FUTURE_YEARS = [2040, 2045, 2050]
BASE_YEARS = [2000, 2005, 2010]


async def hot_months(db: AsyncSession, lat: float, lng: float) -> list[int]:
    hit = await cache.peek(db, normal_key(lat, lng))
    if hit is None:
        a, b = power.half_degree(lat, lng)
        await refresh_normal(db, a, b)
        hit = await cache.peek(db, normal_key(lat, lng))
    normals = (hit.value if hit else {}).get("normals", {})
    monthly: dict[int, list[float]] = {}
    for k, v in normals.items():
        monthly.setdefault(int(k[:2]), []).append(v)
    return W.summarize_hot_season(monthly)


async def compute_history(db: AsyncSession, chunk: str) -> dict:
    lat, lng = h3.cell_to_latlng(chunk)
    months = await hot_months(db, lat, lng)
    this_year = datetime.now(UTC).year
    years = list(range(FIRST_YEAR, this_year + 1))
    sem = asyncio.Semaphore(4)

    async def one(item: dict, asset: str) -> float | None:
        async with sem:
            try:
                v = await read_point(await pc.sign(item["assets"][asset]["href"]), lat, lng)
            except Exception:
                return None
        if v is None or v == 0:
            return None
        return float(v) * R.MODIS_LST_SCALE - R.K_TO_C

    rows = []
    for y in years:
        m0, m1 = min(months), max(months)
        end_day = 31 if m1 in (1, 3, 5, 7, 8, 10, 12) else (30 if m1 != 2 else 28)
        start, end = date(y, m0, 1), date(y, m1, end_day)
        if start > datetime.now(UTC).date():
            continue
        try:
            items = await pc.search(
                ["modis-11A2-061"], [lng - 0.01, lat - 0.01, lng + 0.01, lat + 0.01], f"{start}/{end}", max_items=40
            )
        except UpstreamError:
            continue
        items = [i for i in items if i["id"].startswith("MOD11A2")] or items  # Terra (10:30) like Landsat
        days = [v for v in await asyncio.gather(*[one(i, "LST_Day_1km") for i in items]) if v is not None]
        nights = [v for v in await asyncio.gather(*[one(i, "LST_Night_1km") for i in items]) if v is not None]
        if not days and not nights:
            continue
        rows.append(
            {
                "chunk": chunk,
                "year": y,
                "day_lst_c": round(statistics.median(days), 1) if days else None,
                "night_lst_c": round(statistics.median(nights), 1) if nights else None,
                "months": months,
                "n_composites": len(items),
                "source": "modis_pc",
            }
        )
    if rows:
        stmt = insert(ZoneHistory).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["chunk", "year"],
            set_={
                "day_lst_c": stmt.excluded.day_lst_c,
                "night_lst_c": stmt.excluded.night_lst_c,
                "months": stmt.excluded.months,
                "n_composites": stmt.excluded.n_composites,
            },
        )
        await db.execute(stmt)
        await db.commit()
    return {"years": len(rows), "months": months}


def cmip6_key(lat: float, lng: float) -> str:
    return f"cmip6:{round(lat * 4) / 4},{round(lng * 4) / 4}"


async def compute_cmip6(db: AsyncSession, lat: float, lng: float) -> dict:
    months = await hot_months(db, lat, lng)
    deltas = []
    used = []
    for model in cmip6.MODELS:
        try:
            base = []
            for y in BASE_YEARS:
                base += await cmip6.tasmax(model, "historical", y, lat, lng, months)
            fut = []
            for y in FUTURE_YEARS:
                fut += await cmip6.tasmax(model, "ssp245", y, lat, lng, months)
        except Exception as e:
            log.warning("cmip6 model failed", extra={"data": {"model": model, "err": str(e)[:200]}})
            continue
        if base and fut:
            deltas.append(statistics.mean(fut) - statistics.mean(base))
            used.append(model)
    if not deltas:
        raise UpstreamError("cmip6", "no model answered")
    value = {
        "delta_c": round(statistics.mean(deltas), 2),
        "per_decade_c": round(
            statistics.mean(deltas) / ((statistics.mean(FUTURE_YEARS) - statistics.mean(BASE_YEARS)) / 10), 3
        ),
        "models": used,
        "scenario": "ssp245",
        "baseline_years": BASE_YEARS,
        "future_years": FUTURE_YEARS,
        "months": months,
    }
    await cache.write(db, cmip6_key(lat, lng), "cmip6", value, CMIP6_TTL, as_of="NEX-GDDP-CMIP6")
    return value
