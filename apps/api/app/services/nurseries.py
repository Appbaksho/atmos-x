"""Nearby nurseries (prompt-v1 §5.3, §6.13): OpenStreetMap via Overpass in the worker, cached 7 days.

No curated list with invented coordinates (V0's three Dhaka entries are removed). Partner nurseries
from the marketplace (`nursery_partners`) are listed first when there are any.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..engines.heat import haversine_m
from ..models import NurseryPartner
from ..sources import SRC
from . import cache, jobs
from .spots import overpass

TTL = timedelta(days=7)


def key(lat: float, lng: float, radius_m: int) -> str:
    return f"nurseries:{round(lat, 2)},{round(lng, 2)}:{radius_m}"


def _query(lat: float, lng: float, r: int) -> str:
    return (
        f"[out:json][timeout:40];("
        f'nwr["shop"~"^(garden_centre|garden|plant|nursery|florist)"](around:{r},{lat},{lng});'
        f'nwr["landuse"="plant_nursery"](around:{r},{lat},{lng});'
        f'nwr["shop"]["name"~"nursery|নার্সারি",i](around:{r},{lat},{lng});'
        f'nwr["landuse"]["name"~"nursery|নার্সারি",i](around:{r},{lat},{lng});'
        ");out center tags 80;"
    )


async def refresh(db: AsyncSession, lat: float, lng: float, radius_m: int) -> dict:
    j = await overpass(_query(lat, lng, radius_m))
    out = []
    for e in j.get("elements", []):
        t = e.get("tags", {})
        la = e.get("lat") or (e.get("center") or {}).get("lat")
        lo = e.get("lon") or (e.get("center") or {}).get("lon")
        if la is None or lo is None:
            continue
        name = t.get("name") or t.get("name:en") or t.get("name:bn")
        florist_only = t.get("shop") == "florist" and not any(
            w in (name or "").lower() for w in ("nursery", "garden", "নার্সারি")
        )
        out.append(
            {
                "id": f"osm-{e['type'][0]}{e['id']}",
                "name": name,
                "kind": "plant_nursery" if t.get("landuse") == "plant_nursery" else (t.get("shop") or "nursery"),
                "location": {"lat": la, "lng": lo},
                "phone": t.get("phone") or t.get("contact:phone"),
                "hours": t.get("opening_hours"),
                "address": ", ".join(x for x in (t.get("addr:street"), t.get("addr:city")) if x) or None,
                "osm_url": f"https://www.openstreetmap.org/{e['type']}/{e['id']}",
                "florist_only": florist_only,
            }
        )
    await cache.write(
        db, key(lat, lng, radius_m), "osm", {"nurseries": out}, TTL, as_of=datetime.now(UTC).date().isoformat()
    )
    return {"nurseries": len(out)}


async def nearby(db: AsyncSession, lat: float, lng: float, radius_m: int) -> dict:
    radius_m = max(1000, min(20000, radius_m))
    k = key(lat, lng, radius_m)
    hit = await cache.peek(db, k)
    if hit is None or not hit.fresh:
        await jobs.enqueue(
            db, "nurseries", k, {"lat": lat, "lng": lng, "radius_m": radius_m}, priority=6, max_attempts=4
        )
        await db.commit()
    partners = (await db.execute(select(NurseryPartner).where(NurseryPartner.status == "active"))).scalars().all()
    items = [
        {
            "id": str(p.id),
            "name": p.name,
            "kind": "partner",
            "location": {"lat": p.lat, "lng": p.lng},
            "phone": p.phone,
            "hours": None,
            "address": p.address,
            "osm_url": None,
            "partner": True,
            "is_demo": p.is_demo,
        }
        for p in partners
    ]
    items += [
        {**n, "partner": False} for n in (hit.value.get("nurseries", []) if hit else []) if not n.get("florist_only")
    ]
    for n in items:
        n["dist_m"] = round(haversine_m(lat, lng, n["location"]["lat"], n["location"]["lng"]))
    items = sorted([n for n in items if n["dist_m"] <= radius_m], key=lambda n: (not n.get("partner"), n["dist_m"]))[
        :40
    ]
    return {
        "nurseries": items,
        "status": "ready" if hit else "pending",
        "meta": {
            "live": bool(hit and hit.fresh),
            "stale": bool(hit and not hit.fresh),
            "generated_at": datetime.now(UTC).isoformat(),
            "sources": [SRC["osm"].src(as_of=hit.as_of if hit else None, kind="reference").model_dump()],
        },
    }
