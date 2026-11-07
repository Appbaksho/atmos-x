"""OpenAQ v3 stations (prompt-v1 §5.2). Needs OPENAQ_API_KEY. Not NASA.

The docs show both 'lat,lng' and 'lng,lat' for `coordinates`; verify_sources checks that the
returned stations are near the query point, and this module uses 'lat,lng' (v3 API reference).
"""

from __future__ import annotations

from ..config import settings
from ..http import get_json

PROVIDER = "openaq"
BASE = "https://api.openaq.org/v3"
PM25_PARAMETER_ID = 2


def _headers() -> dict:
    return {"X-API-Key": settings.openaq_api_key, "Accept": "application/json"}


async def locations(lat: float, lng: float, radius_m: int = 25000, limit: int = 20, timeout: float = 20) -> list[dict]:
    j = await get_json(
        PROVIDER,
        f"{BASE}/locations",
        params={
            "coordinates": f"{lat:.4f},{lng:.4f}",
            "radius": min(radius_m, 25000),
            "limit": limit,
            "parameters_id": PM25_PARAMETER_ID,
        },
        headers=_headers(),
        timeout=timeout,
        retries=1,
    )
    out = []
    for loc in j.get("results", []):
        coords = loc.get("coordinates") or {}
        sensors = [
            s
            for s in loc.get("sensors", [])
            if (s.get("parameter") or {}).get("id") == PM25_PARAMETER_ID
            or (s.get("parameter") or {}).get("name") == "pm25"
        ]
        if not sensors or coords.get("latitude") is None:
            continue
        out.append(
            {
                "id": loc["id"],
                "name": loc.get("name") or f"Station {loc['id']}",
                "lat": coords["latitude"],
                "lng": coords["longitude"],
                "sensor_ids": [s["id"] for s in sensors],
                "provider": (loc.get("provider") or {}).get("name"),
            }
        )
    return out


async def latest(location_id: int, timeout: float = 20) -> list[dict]:
    j = await get_json(
        PROVIDER, f"{BASE}/locations/{location_id}/latest", headers=_headers(), timeout=timeout, retries=1
    )
    return [
        {"sensor_id": r.get("sensorsId"), "value": r.get("value"), "datetime": (r.get("datetime") or {}).get("utc")}
        for r in j.get("results", [])
    ]
