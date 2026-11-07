"""'If you act' vs 'if you don't' (prompt-v1 §7.6, §9 GET /zones/{id}/projection).

without_c: hot-season surface temperature now (mean of the last 3 MODIS hot seasons at the chunk)
plus warming: the NEX-GDDP-CMIP6 ssp245 ensemble delta when cached, else the observed MODIS trend,
else a flat line with a note. Never both. with_c subtracts ramped tree cooling and roof/shade cooling.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..engines import cooling as CO
from ..models import ZoneHistory
from ..sources import SRC
from . import cache, jobs
from .history import cmip6_key
from .scan import get_zone_row


async def projection(db: AsyncSession, zid: str, trees: int, roof_m2: int, shade: int) -> dict:
    z = await get_zone_row(db, zid)
    hist = (
        (await db.execute(select(ZoneHistory).where(ZoneHistory.chunk == z.chunk).order_by(ZoneHistory.year)))
        .scalars()
        .all()
    )
    pts = [(h.year, h.day_lst_c) for h in hist if h.day_lst_c is not None]
    sources = []
    now_year = datetime.now(UTC).year
    if pts:
        recent = [v for y, v in pts if y >= now_year - 3 and y < now_year] or [v for _, v in pts[-3:]]
        now_c = round(sum(recent) / len(recent), 1)
        now_basis = "modis_hot_season"
        sources.append(SRC["modis_lst"].src(as_of=str(pts[-1][0]), kind="observation", resolution_m=1000).model_dump())
    else:
        now_c = z.lst_c or 0.0
        now_basis = "landsat_zone"
        await jobs.enqueue(db, "zone_history", z.chunk, {"chunk": z.chunk}, priority=7, max_attempts=3)
    cm = await cache.peek(db, cmip6_key(z.centroid_lat, z.centroid_lng))
    if cm is None:
        await jobs.enqueue(
            db,
            "cmip6",
            cmip6_key(z.centroid_lat, z.centroid_lng),
            {"lat": z.centroid_lat, "lng": z.centroid_lng},
            priority=7,
            max_attempts=3,
        )
    await db.commit()
    trend = CO.linear_trend(pts)
    if cm is not None:
        per_year = cm.value["per_decade_c"] / 10
        warming_source = "cmip6"
        sources.append(SRC["cmip6"].src(as_of=cm.value["scenario"], kind="model").model_dump())
    elif trend is not None:
        per_year = trend
        warming_source = "modis_trend"
    else:
        per_year = 0.0
        warming_source = "none"
    lines = CO.project(now_c, per_year, z.area_km2, trees, roof_m2, shade, now_year)
    assumptions = [
        {"code": "assumption.surface", "params": {"basis": now_basis}},
        {
            "code": f"assumption.warming.{warming_source}",
            "params": {"per_decade": round(per_year * 10, 2), **({"models": len(cm.value["models"])} if cm else {})},
        },
        {
            "code": "assumption.hot_season",
            "params": {"months": ", ".join(str(m) for m in (hist[0].months if hist else []))},
        },
        {"code": "assumption.tree_ramp"},
        {
            "code": "assumption.tree_cooling",
            "params": {"per_100_trees": round(100 * CO.tree_c(z.area_km2), 2), "area_km2": round(z.area_km2, 3)},
        },
        {"code": "assumption.roof_cooling", "params": {"per_1000_m2": round(1000 * CO.roof_c(z.area_km2), 2)}},
        {"code": "assumption.inputs", "params": {"trees": trees, "roof_m2": roof_m2, "shade": shade}},
        {"code": "assumption.ranges"},
    ]
    sources.append(SRC["atmos_reference"].src(kind="estimate").model_dump())
    return {
        **lines,
        "now_c": now_c,
        "warming_source": warming_source,
        "assumptions": assumptions,
        "meta": {"live": bool(pts), "stale": False, "generated_at": datetime.now(UTC).isoformat(), "sources": sources},
    }
