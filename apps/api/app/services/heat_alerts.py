"""C12 · Heat-warning notifications. Once a day the worker reads each home area's conditions (the
same warnings the Home screen shows: BMD heat-wave bands in Bangladesh, NOAA heat-index bands
elsewhere) and notifies the people living there, at most once per area per day.

Areas are ~0.05° cells (about 5 km) so one forecast serves a neighbourhood. Guests and demo users
are skipped; demo users see the demo story instead.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Profile, User
from .notify import notify

log = logging.getLogger("atmos.heat_alerts")

CELL = 0.05
HEAT_CODES = ("warning.heatwave_", "warning.heat_")


def cell_of(lat: float, lng: float) -> tuple[float, float]:
    return round(round(lat / CELL) * CELL, 3), round(round(lng / CELL) * CELL, 3)


def heat_warning(cond: dict) -> dict | None:
    """The heat warning in a conditions answer, with the hottest 'feels like' of the next 3 days."""
    hits = [w for w in cond.get("warnings") or [] if str((w.get("text") or {}).get("code", "")).startswith(HEAT_CODES)]
    if not hits:
        return None
    feels = (
        max((d.get("feels_max_c") or d.get("tmax_c") or 0) for d in (cond.get("forecast") or [])[:3])
        if cond.get("forecast")
        else None
    )
    return {"level": hits[0].get("level"), "feels": round(feels) if feels else None, "until": hits[0].get("until")}


async def run(db: AsyncSession, now: datetime | None = None) -> dict:
    from . import conditions as C

    now = now or datetime.now(UTC)
    day = (now + timedelta(hours=6)).date().isoformat()  # Dhaka calendar day for the dedupe key
    rows = (
        await db.execute(
            select(Profile.user_id, Profile.home_lat, Profile.home_lng, Profile.city)
            .join(User, User.id == Profile.user_id)
            .where(
                Profile.home_lat.is_not(None),
                Profile.home_lng.is_not(None),
                User.role != "guest",
                User.is_demo.is_(False),
            )
        )
    ).all()
    areas: dict[tuple[float, float], list[tuple]] = defaultdict(list)
    for uid, lat, lng, city in rows:
        areas[cell_of(lat, lng)].append((uid, city))
    sent = warned_areas = 0
    for (lat, lng), people in areas.items():
        try:
            cond = await C.conditions(db, lat, lng, "en")
        except Exception as e:  # noqa: BLE001  one area failing never stops the others
            log.warning("conditions failed for an area", extra={"data": {"err": str(e)[:120]}})
            continue
        w = heat_warning(cond)
        if w is None:
            continue
        warned_areas += 1
        for uid, city in people:
            await notify(
                db,
                uid,
                "heat_warning",
                {
                    "code": "notif.heat.warning",
                    "params": {"place": city or cond.get("place") or "", "feels": w["feels"]},
                },
                screen="S04",
                params={"level": w["level"], "until": w["until"]},
                dedupe_key=f"heat:{day}:{lat},{lng}",
            )
            sent += 1
    await db.commit()
    return {"areas": len(areas), "warned_areas": warned_areas, "notified": sent}
