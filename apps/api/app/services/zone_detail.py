"""GET /zones/{id} (prompt-v1 §9): a row read plus 'now' readings and history. Never re-scans."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..engines import weather as W
from ..http import UpstreamError
from ..models import Scan, ZoneHistory
from ..sources import SRC
from . import jobs
from .conditions_now import forecast
from .scan import get_zone_row, summary, superseded_by

HISTORY_JOB = "zone_history"


async def detail(db: AsyncSession, zid: str, lang: str) -> dict:
    z = await get_zone_row(db, zid)
    base = summary(z, lang)
    scan = await db.get(Scan, z.scan_id)
    air = feels = None
    sources = list(scan.sources) if scan else []
    live = True
    stale = False
    try:
        fc = await forecast(db, z.centroid_lat, z.centroid_lng)
        cur = fc.value["current"]
        if cur["temp"] is not None:
            air = round(cur["temp"], 1)
            feels = round(W.heat_index(cur["temp"], cur["rh"] or 0), 1)
        sources.append(SRC["open_meteo"].src(as_of=fc.as_of, kind="model").model_dump())
        stale = fc.stale
    except UpstreamError:
        live = False
    hist = (
        (await db.execute(select(ZoneHistory).where(ZoneHistory.chunk == z.chunk).order_by(ZoneHistory.year)))
        .scalars()
        .all()
    )
    if hist:
        history_status = "ready"
        sources.append(
            SRC["modis_lst"].src(as_of=str(hist[-1].year), kind="observation", resolution_m=1000).model_dump()
        )
    else:
        history_status = "pending"
        await jobs.enqueue(db, HISTORY_JOB, z.chunk, {"chunk": z.chunk}, priority=7, max_attempts=3)
        await db.commit()
    place = None
    if scan:
        place = scan.place.get(lang) or next((v for k, v in scan.place.items() if not k.startswith("_")), None)
    return {
        **base,
        "air_c": air,
        "feels_c": feels,
        "causes": z.causes,
        "why": z.why,
        "what_if_green": z.what_if,
        "history": [{"year": h.year, "day_lst_c": h.day_lst_c, "night_lst_c": h.night_lst_c} for h in hist],
        "history_kind": "lst",
        "history_status": history_status,
        "superseded_by": await superseded_by(db, z),
        "place": place,
        "meta": {
            "live": live and not stale,
            "stale": stale,
            "generated_at": datetime.now(UTC).isoformat(),
            "sources": _dedupe(sources),
            "pipeline_version": scan.pipeline_version if scan else None,
        },
    }


def _dedupe(sources: list[dict]) -> list[dict]:
    seen, out = set(), []
    for s in sources:
        if s["id"] in seen:
            continue
        seen.add(s["id"])
        out.append(s)
    return out
