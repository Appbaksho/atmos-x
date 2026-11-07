"""Planting spots (prompt-v1 §7.10, E8). Worker only (Overpass); stored per zone for 7 days.

Ground: open land (parks, grass, brownfield, school/worship grounds) minus buildings, clipped to the
zone polygon. Roofs: building footprints ≥ 80 m² clipped to the zone polygon (E8: no whole buildings
by centroid). Roadside: tree pits every 25 m along streets inside the zone. Areas are measured in a
UTM projection. Invariant (tested): roof_m2 + ground_m2 ≤ zone_area_m2.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

import h3
from pyproj import Transformer
from shapely.geometry import LineString, Polygon, mapping, shape
from shapely.ops import transform, unary_union
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..http import UpstreamError, fetch
from ..models import PlantingSpots, ScanZone
from ..providers.rasterio_io import utm_epsg

log = logging.getLogger("atmos.spots")
TTL = timedelta(days=7)
MIN_ROOF_M2 = 80
ROADSIDE_STEP_M = 25
MAX_GROUND, MAX_ROOFS, MAX_ROADSIDE = 40, 60, 60


def zone_polygon(cells: list[str]) -> Polygon:
    shp = h3.cells_to_h3shape(cells)
    geo = shp.__geo_interface__
    g = shape(geo)
    return g if isinstance(g, Polygon) else max(g.geoms, key=lambda p: p.area)


def ground_suitability(t: dict) -> float:
    if t.get("landuse") in ("grass", "greenfield", "meadow", "village_green") or t.get("leisure") in ("park", "garden"):
        return 0.9
    if t.get("landuse") == "brownfield":
        return 0.75
    if t.get("leisure") in ("playground", "pitch"):
        return 0.5
    return 0.6  # school, worship, hospital grounds: needs permission


async def overpass(query: str) -> dict:
    last = None
    for url in settings.overpass_list:
        try:
            r = await fetch("overpass", "POST", url, data={"data": query}, timeout=60, retries=1)
            return r.json()
        except Exception as e:
            last = e
            continue
    raise UpstreamError("overpass", f"all mirrors failed: {last}")


def build(elements: list[dict], zone: Polygon) -> dict:
    lat0, lng0 = zone.centroid.y, zone.centroid.x
    fwd = Transformer.from_crs("EPSG:4326", utm_epsg(lat0, lng0), always_xy=True).transform
    zone_m = transform(fwd, zone)
    zone_area = zone_m.area

    def poly(e: dict) -> Polygon | None:
        g = e.get("geometry")
        if not g or len(g) < 4 or g[0] != g[-1]:
            return None
        p = Polygon([(pt["lon"], pt["lat"]) for pt in g])
        return p if p.is_valid else p.buffer(0)

    buildings = []
    for e in elements:
        if e.get("tags", {}).get("building"):
            p = poly(e)
            if p is not None:
                buildings.append((e, p, transform(fwd, p)))
    built_union = unary_union([b[2] for b in buildings]) if buildings else None

    features, ground_m2, roof_m2, roadside_m = [], 0.0, 0.0, 0.0
    ground: list[dict] = []
    for e in elements:
        t = e.get("tags", {})
        if t.get("building") or t.get("highway"):
            continue
        p = poly(e)
        if p is None:
            continue
        pm = transform(fwd, p).intersection(zone_m)
        if built_union is not None:
            pm = pm.difference(built_union)
        a = pm.area
        if a < 20:
            continue
        ground_m2 += a
        ground.append(
            {
                "type": "Feature",
                "geometry": mapping(p.intersection(zone)),
                "properties": {
                    "id": f"g-{e['id']}",
                    "kind": "ground",
                    "area_m2": round(a),
                    "suitability": round(ground_suitability(t) * min(1, a / 200 + 0.4), 2),
                    "name": t.get("name"),
                },
            }
        )
    ground_m2 = min(ground_m2, zone_area)

    roofs: list[dict] = []
    for e, p, pm in buildings:
        clip = pm.intersection(zone_m)
        a = clip.area
        if a < MIN_ROOF_M2:
            continue
        roof_m2 += a
        shp = e.get("tags", {}).get("roof:shape")
        suit = 0.9 if shp == "flat" else (0.3 if shp else 0.7)
        roofs.append(
            {
                "type": "Feature",
                "geometry": mapping(p.intersection(zone)),
                "properties": {
                    "id": f"r-{e['id']}",
                    "kind": "roof",
                    "area_m2": round(a),
                    "suitability": suit,
                    "name": e.get("tags", {}).get("name"),
                },
            }
        )
    roof_m2 = min(roof_m2, max(0.0, zone_area - ground_m2))

    road: list[dict] = []
    for e in elements:
        t = e.get("tags", {})
        g = e.get("geometry")
        if not t.get("highway") or not g or len(g) < 2:
            continue
        line_m = transform(fwd, LineString([(pt["lon"], pt["lat"]) for pt in g])).intersection(zone_m)
        if line_m.is_empty:
            continue
        roadside_m += line_m.length
        inv = Transformer.from_crs(utm_epsg(lat0, lng0), "EPSG:4326", always_xy=True).transform
        lines = getattr(line_m, "geoms", [line_m])
        for ln in lines:
            d = ROADSIDE_STEP_M / 2
            while d < ln.length:
                x, y = inv(*ln.interpolate(d).coords[0])
                road.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [round(x, 6), round(y, 6)]},
                        "properties": {
                            "id": f"p-{e['id']}-{len(road)}",
                            "kind": "roadside",
                            "area_m2": 4,
                            "suitability": 0.6,
                            "name": t.get("name"),
                        },
                    }
                )
                d += ROADSIDE_STEP_M

    def pick(xs: list, n: int) -> list:
        return xs if len(xs) <= n else [x for i, x in enumerate(xs) if i % -(-len(xs) // n) == 0][:n]

    ground.sort(key=lambda f: -f["properties"]["area_m2"] * f["properties"]["suitability"])
    roofs.sort(key=lambda f: -f["properties"]["area_m2"])
    features = ground[:MAX_GROUND] + roofs[:MAX_ROOFS] + pick(road, MAX_ROADSIDE)
    return {
        "features": features,
        "totals": {"ground_m2": round(ground_m2), "roof_m2": round(roof_m2), "roadside_m": round(roadside_m)},
        "zone_area_m2": round(zone_area),
    }


def _query(zone: Polygon) -> str:
    minx, miny, maxx, maxy = zone.buffer(0.0006).bounds
    bb = f"{miny:.5f},{minx:.5f},{maxy:.5f},{maxx:.5f}"
    return (
        f"[out:json][timeout:50][bbox:{bb}];"
        '(way["leisure"~"^(park|garden|playground|pitch)$"];way["landuse"~"^(grass|brownfield|greenfield|meadow|village_green|recreation_ground|religious)$"];'
        'way["amenity"~"^(school|place_of_worship|college|university|hospital)$"];way["natural"~"^(scrub|grassland)$"];);out tags geom qt;'
        'way["building"];out tags geom qt;'
        'way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street)$"];out tags geom qt;'
    )


async def compute(db: AsyncSession, zone_id: str) -> dict:
    z = await db.get(ScanZone, zone_id)
    if z is None:
        return {"skipped": "unknown zone"}
    zone = zone_polygon(list(z.h3))
    j = await overpass(_query(zone))
    out = await asyncio.to_thread(build, j.get("elements", []), zone)
    now = datetime.now(UTC)
    stmt = insert(PlantingSpots).values(
        zone_id=zone_id,
        status="ready",
        features=out["features"],
        totals=out["totals"],
        zone_area_m2=out["zone_area_m2"],
        fetched_at=now,
        expires_at=now + TTL,
        error=None,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["zone_id"],
        set_={
            "status": "ready",
            "features": stmt.excluded.features,
            "totals": stmt.excluded.totals,
            "zone_area_m2": stmt.excluded.zone_area_m2,
            "fetched_at": now,
            "expires_at": stmt.excluded.expires_at,
            "error": None,
        },
    )
    await db.execute(stmt)
    await db.commit()
    return out["totals"]
