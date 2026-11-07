"""Small Open-Meteo helpers shared by the request path and jobs (cached, 4 s timeout)."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from ..http import UpstreamError
from ..providers import open_meteo
from . import cache

FORECAST_TTL = timedelta(minutes=30)
FORECAST_STALE = timedelta(hours=24)


async def forecast(db: AsyncSession, lat: float, lng: float, *, timeout: float = 4.0) -> cache.Cached:
    clat, clng = open_meteo.cell(lat, lng)
    return await cache.cached(
        db,
        f"om:fc:{clat},{clng}",
        "open_meteo",
        FORECAST_TTL,
        lambda: open_meteo.forecast(clat, clng, timeout=timeout),
        stale_for=FORECAST_STALE,
        as_of=lambda v: v["current"]["time"],
    )


async def today_tmax(db: AsyncSession, lat: float, lng: float) -> float | None:
    try:
        fc = (await forecast(db, lat, lng, timeout=10)).value
    except UpstreamError:
        return None
    today = fc["current"]["time"][:10]
    for d in fc["daily"]:
        if d["date"] == today:
            return d["tmax"]
    return None
