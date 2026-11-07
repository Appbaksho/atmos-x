"""NASA GIBS layer for city zoom (prompt-v1 §5.2, E11). Tiles are fetched by the browser.

The default date comes from WMTSCapabilities.xml (5.8 MB), fetched by a worker job and cached 6 h.
Path order is z, then y, then x. Max zoom 7 (≈ 1 km). 404 tiles (cloud, swath gaps) are normal.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from ..http import fetch
from ..sources import SRC
from . import cache, jobs

LAYER = "MODIS_Terra_Land_Surface_Temp_Day"
CAPS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml"
TILE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{date}/GoogleMapsCompatible_Level7/{{z}}/{{y}}/{{x}}.png"
KEY = "gibs:caps"
TTL = timedelta(hours=6)


async def layer(db: AsyncSession) -> dict:
    hit = await cache.peek(db, KEY)
    if hit is None or not hit.fresh:
        await jobs.enqueue(db, "gibs_caps", "caps", {}, priority=6, max_attempts=3)
        await db.commit()
    date = hit.value.get("default_date") if hit else None
    return {
        "layer": LAYER,
        "date": date,
        "tile_url": TILE.format(layer=LAYER, date=date or "default"),
        "max_zoom": 7,
        "meta": {
            "live": bool(hit and hit.fresh),
            "stale": bool(hit and not hit.fresh),
            "generated_at": datetime.now(UTC).isoformat(),
            "sources": [SRC["gibs"].src(as_of=date, kind="observation").model_dump()],
        },
    }


def parse_default_date(xml: str, layer_id: str = LAYER) -> str | None:
    i = xml.find(f"<ows:Identifier>{layer_id}</ows:Identifier>")
    if i < 0:
        return None
    end = xml.find("</Layer>", i)
    m = re.search(r"<Default>(\d{4}-\d{2}-\d{2})</Default>", xml[i:end])
    return m.group(1) if m else None


async def refresh(db: AsyncSession) -> dict:
    r = await fetch("gibs", "GET", CAPS, timeout=120, retries=2)
    date = parse_default_date(r.text)
    await cache.write(db, KEY, "gibs", {"default_date": date}, TTL, as_of=date)
    return {"default_date": date}
