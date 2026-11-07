"""Nominatim reverse geocoding (prompt-v1 §5.2): ≤ 1 request/s, real contact in User-Agent, 30-day cache."""

from __future__ import annotations

import asyncio
import re
import time

from ..http import get_json

PROVIDER = "nominatim"
URL = "https://nominatim.openstreetmap.org/reverse"

_lock = asyncio.Lock()
_last = 0.0
CITY_SUFFIX = re.compile(r"\s+(Metropolitan|District|Division|City Corporation|মহানগর|জেলা|বিভাগ)$", re.U)


async def _spaced() -> None:
    global _last
    async with _lock:
        wait = 1.1 - (time.monotonic() - _last)
        if wait > 0:
            await asyncio.sleep(wait)
        _last = time.monotonic()


async def reverse(lat: float, lng: float, lang: str, *, zoom: int = 16, timeout: float = 4.0) -> dict:
    await _spaced()
    j = await get_json(
        PROVIDER,
        URL,
        params={
            "format": "jsonv2",
            "lat": lat,
            "lon": lng,
            "zoom": zoom,
            "addressdetails": 1,
            "namedetails": 1,
            "accept-language": f"{lang},en",
        },
        timeout=timeout,
    )
    return parse(j)


def parse(j: dict) -> dict:
    a = j.get("address", {}) or {}
    local = (
        a.get("suburb")
        or a.get("city_district")
        or a.get("quarter")
        or a.get("neighbourhood")
        or a.get("village")
        or a.get("town")
        or j.get("name")
        or ""
    )
    city_raw = (
        a.get("city")
        or a.get("town")
        or a.get("village")
        or a.get("county")
        or a.get("state_district")
        or a.get("state")
    )
    city = CITY_SUFFIX.sub("", city_raw) if city_raw else None
    parts = [x for i, x in enumerate([local, city]) if x and [local, city].index(x) == i]
    place = ", ".join(parts) or ", ".join((j.get("display_name") or "").split(",")[:2]).strip()
    road = a.get("road") or a.get("pedestrian") or a.get("residential")
    near = road or a.get("neighbourhood") or a.get("quarter") or a.get("suburb") or j.get("name")
    return {
        "place": place,
        "city": city,
        "country": a.get("country"),
        "country_code": (a.get("country_code") or "").upper() or None,
        "near": near,
    }
