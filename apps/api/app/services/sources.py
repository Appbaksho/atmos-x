"""`/sources`: every source with its live status and latest data date (§9, §4 rules 9 and 11)."""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import PIPELINE_VERSION, settings
from ..engines import heat as heat_engine
from ..http import BREAKERS
from ..sources import ALL_SOURCES


class SourceStatus(BaseModel):
    id: str
    name: str
    url: str
    kind: str
    licence: str
    credit: str
    used_for: str
    nasa: bool
    status: str  # active | degraded | off | idle
    reason: str | None = None
    latest_data: str | None = None
    resolution_m: float | None = None


class SourcesOut(BaseModel):
    sources: list[SourceStatus]
    active_nasa_count: int
    heat_score: dict
    driver_fit: dict | None
    pipeline_version: str
    generated_at: str


def credential_off() -> list[str]:
    off = []
    for s in ALL_SOURCES:
        if s.needs == "earthdata" and not settings.earthdata_enabled:
            off.append(s.id)
        if s.needs == "openaq" and not settings.openaq_api_key:
            off.append(s.id)
    return off


async def _latest_dates(db: AsyncSession) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        row = (
            await db.execute(
                text("select max(lst_to), max(ndvi_date), max(worldcover_year), max(night_to) from composites")
            )
        ).first()
        if row:
            if row[0]:
                out["landsat"] = row[0].isoformat()
            if row[1]:
                out["hls"] = row[1].isoformat()
            if row[2]:
                out["worldcover"] = str(row[2])
            if row[3]:
                out["modis_lst"] = row[3].isoformat()
        rows = (
            await db.execute(text("select source, max(as_of) from data_cache where as_of is not null group by source"))
        ).all()
        for src, as_of in rows:
            if src and as_of and src not in out:
                out[src] = as_of
    except Exception:
        pass
    return out


async def _driver_fit(db: AsyncSession) -> dict | None:
    try:
        row = (
            await db.execute(
                text(
                    "select area_key, coefs, r2, n, label, created_at from driver_coefficients order by created_at desc limit 1"
                )
            )
        ).first()
    except Exception:
        return None
    if not row:
        return None
    return {"area": row[0], "coefs": row[1], "r2": row[2], "n": row[3], "label": row[4], "as_of": row[5].isoformat()}


async def sources_report(db: AsyncSession) -> SourcesOut:
    off = set(credential_off())
    latest = await _latest_dates(db)
    out: list[SourceStatus] = []
    for s in ALL_SOURCES:
        b = BREAKERS.get(s.breaker or "")
        if s.id in off:
            status, reason = "off", f"needs {s.needs} credential"
        elif b is not None and b.state == "degraded":
            status, reason = "degraded", b.last_error
        elif s.id in latest or (b is not None and b.last_ok):
            status, reason = "active", None
        else:
            status, reason = "idle", "no data fetched yet"
        out.append(
            SourceStatus(
                id=s.id,
                name=s.name,
                url=s.url,
                kind=s.kind,
                licence=s.licence,
                credit=s.credit,
                used_for=s.used_for,
                nasa=s.nasa,
                status=status,
                reason=reason,
                latest_data=latest.get(s.id),
                resolution_m=s.resolution_m,
            )
        )
    return SourcesOut(
        sources=out,
        active_nasa_count=sum(1 for s in out if s.nasa and s.status == "active"),
        heat_score=heat_engine.formula(),
        driver_fit=await _driver_fit(db),
        pipeline_version=PIPELINE_VERSION,
        generated_at=datetime.now(UTC).isoformat(),
    )
