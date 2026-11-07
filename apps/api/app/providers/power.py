"""NASA POWER daily point API (prompt-v1 §5.2). Fill is −999 and is never used as a number.

Do NOT use the climatology API for a normal: its T2M_MAX is the period's hourly maximum. The normal
is the mean daily T2M_MAX for day-of-year ± 7 over 2001–2025 (engines.weather.normal_for).
"""

from __future__ import annotations

from datetime import date

from ..engines.weather import clean_power
from ..http import get_json

PROVIDER = "power"
URL = "https://power.larc.nasa.gov/api/temporal/daily/point"


def half_degree(lat: float, lng: float) -> tuple[float, float]:
    """Cache cell for normals: 0.5°."""
    return round(round(lat * 2) / 2, 2), round(round(lng * 2) / 2, 2)


async def daily(
    lat: float, lng: float, start: date, end: date, params: list[str], *, timeout: float = 60, retries: int = 2
) -> dict:
    j = await get_json(
        PROVIDER,
        URL,
        params={
            "parameters": ",".join(params),
            "community": "AG",
            "longitude": round(lng, 4),
            "latitude": round(lat, 4),
            "start": start.strftime("%Y%m%d"),
            "end": end.strftime("%Y%m%d"),
            "format": "JSON",
        },
        timeout=timeout,
        retries=retries,
    )
    p = j["properties"]["parameter"]
    units = {k: j.get("parameters", {}).get(k, {}).get("units") for k in params}
    return {"values": {k: clean_power(p.get(k, {})) for k in params}, "units": units}
