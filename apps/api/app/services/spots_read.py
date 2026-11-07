"""GET /zones/{id}/planting-spots: a stored read. Missing or old → queue the Overpass job."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import PlantingSpots
from ..sources import SRC
from . import jobs
from .scan import get_zone_row


async def read(db: AsyncSession, zid: str) -> dict:
    z = await get_zone_row(db, zid)
    row = await db.get(PlantingSpots, zid)
    now = datetime.now(UTC)
    if row is None or (row.expires_at and row.expires_at < now):
        await jobs.enqueue(db, "planting_spots", zid, {"zone_id": zid}, priority=6, max_attempts=4)
        await db.commit()
    status = row.status if row else "pending"
    return {
        "type": "FeatureCollection",
        "features": row.features if row else [],
        "totals": row.totals if row else {"ground_m2": 0, "roof_m2": 0, "roadside_m": 0},
        "zone_area_m2": row.zone_area_m2 if row else round(z.area_km2 * 1e6),
        "status": status,
        "meta": {
            "live": bool(row and row.expires_at and row.expires_at > now),
            "stale": bool(row and row.expires_at and row.expires_at < now),
            "generated_at": now.isoformat(),
            "sources": [
                SRC["osm"].src(as_of=row.fetched_at.date().isoformat() if row else None, kind="reference").model_dump()
            ],
        },
    }
