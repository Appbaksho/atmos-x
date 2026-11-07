"""Air quality (prompt-v1 §7.8, §5.3).

PM2.5 now: a fresh sensor of yours or an OpenAQ station within 2 km (observation) → Open-Meteo CAMS
(model) → GEOS-CF v2 (model). `nasa_pm25` carries GEOS-CF for the same hour when cached, so people
can compare. Forecast: GEOS-CF daily means → CAMS. OpenAQ and GEOS-CF are worker-fed caches.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..engines import aqi as A
from ..engines.heat import haversine_m
from ..http import UpstreamError
from ..models import Sensor
from ..providers import geos, open_meteo
from ..sources import SRC
from . import cache, jobs

AIR_TTL = timedelta(hours=1)
CF_TTL = timedelta(hours=24)
STATIONS_TTL = timedelta(hours=1)
SENSOR_FRESH = timedelta(hours=1)
SENSOR_OFFLINE = timedelta(hours=6)
STATION_NEAR_M = 2000
STATION_MAX_AGE = timedelta(days=7)


def cf_key(lat: float, lng: float) -> str:
    la, lo = geos.cf_index(lat, lng)
    return f"geoscf:{la},{lo}"


def stations_key(lat: float, lng: float) -> str:
    return f"openaq:{round(lat, 2)},{round(lng, 2)}"


async def _cams(db: AsyncSession, lat: float, lng: float) -> cache.Cached:
    clat, clng = open_meteo.cell(lat, lng, 0.05)
    return await cache.cached(
        db,
        f"om:air:{clat},{clng}",
        "open_meteo",
        AIR_TTL,
        lambda: open_meteo.air(clat, clng),
        stale_for=timedelta(hours=24),
        as_of=lambda v: v["current"]["time"],
    )


def _daily(hours: list[dict], key: str, min_n: int = 12) -> dict[str, float]:
    acc: dict[str, list[float]] = defaultdict(list)
    for h in hours:
        v = h.get(key)
        if v is not None:
            acc[h["time"][:10]].append(v)
    return {d: round(sum(v) / len(v), 1) for d, v in acc.items() if len(v) >= min_n}


def sensor_summary(s: Sensor, now: datetime) -> dict:
    online = s.last_seen_at is not None and now - s.last_seen_at <= SENSOR_OFFLINE
    return {
        "id": str(s.id),
        "name": s.name,
        "pm25": s.last_pm25,
        "last_seen": s.last_seen_at.isoformat() if s.last_seen_at else None,
        "online": online,
    }


async def air(db: AsyncSession, lat: float, lng: float, user=None) -> dict:
    now = datetime.now(UTC)
    sources: list[dict] = []
    my: list[Sensor] = []
    if user is not None and user.role != "guest":
        my = (await db.execute(select(Sensor).where(Sensor.user_id == user.id))).scalars().all()

    # Worker-fed caches: OpenAQ stations and GEOS-CF
    stations_hit = None
    if settings.openaq_api_key:
        stations_hit = await cache.peek(db, stations_key(lat, lng))
        if stations_hit is None or not stations_hit.fresh:
            await jobs.enqueue(
                db, "openaq", stations_key(lat, lng), {"lat": lat, "lng": lng}, priority=5, max_attempts=2
            )
    cf_hit = await cache.peek(db, cf_key(lat, lng))
    if cf_hit is None or not cf_hit.fresh:
        await jobs.enqueue(db, "geos_cf", cf_key(lat, lng), {"lat": lat, "lng": lng}, priority=6, max_attempts=3)
    await db.commit()

    cams = None
    try:
        cams = await _cams(db, lat, lng)
    except UpstreamError:
        pass

    stations = []
    if stations_hit:
        for st in stations_hit.value.get("stations", []):
            d = haversine_m(lat, lng, st["lat"], st["lng"])
            # A station silent for over a week is not shown as current.
            fresh = (
                st.get("as_of") and now - datetime.fromisoformat(st["as_of"].replace("Z", "+00:00")) <= STATION_MAX_AGE
            )
            if st.get("pm25") is not None and fresh:
                stations.append({"name": st["name"], "dist_m": round(d), "pm25": st["pm25"], "as_of": st["as_of"]})
        stations.sort(key=lambda s: s["dist_m"])
        stations = stations[:5]

    nasa_now = None
    cf_daily: dict[str, float] = {}
    if cf_hit:
        hours = cf_hit.value.get("hours", [])
        cur = min(
            (h for h in hours if h["pm25"] is not None),
            key=lambda h: abs(datetime.fromisoformat(h["time"]) - now),
            default=None,
        )
        if cur and abs(datetime.fromisoformat(cur["time"]) - now) <= timedelta(hours=2):
            nasa_now = round(cur["pm25"], 1)
        cf_daily = _daily(hours, "pm25")

    # PM2.5 now, by the §5.3 chain
    pm25 = None
    pm25_source = None
    pm25_kind = None
    fresh_sensor = next(
        (s for s in my if s.last_pm25 is not None and s.last_seen_at and now - s.last_seen_at <= SENSOR_FRESH), None
    )
    near_station = (
        next(
            (
                s
                for s in stations
                if s["dist_m"] <= STATION_NEAR_M
                and now - datetime.fromisoformat(s["as_of"].replace("Z", "+00:00")) <= timedelta(hours=3)
            ),
            None,
        )
        if stations
        else None
    )
    pm10 = None
    if fresh_sensor:
        pm25, pm25_source, pm25_kind = fresh_sensor.last_pm25, "sensor", "observation"
    elif near_station:
        pm25, pm25_source, pm25_kind = near_station["pm25"], "openaq", "observation"
    elif cams and cams.value["current"]["pm25"] is not None:
        pm25, pm25_source, pm25_kind = cams.value["current"]["pm25"], "open_meteo", "model"
        pm10 = cams.value["current"]["pm10"]
    elif nasa_now is not None:
        pm25, pm25_source, pm25_kind = nasa_now, "geos_cf", "model"
    if pm25 is None:
        raise UpstreamError("air", "no PM2.5 source answered")

    a25 = A.aqi_pm25(pm25)
    a10 = A.aqi_pm10(pm10) if pm10 is not None else 0
    aqi = max(a25, a10)
    cat = A.category(aqi)

    if pm25_source == "openaq":
        sources.append(SRC["openaq"].src(as_of=near_station["as_of"], kind="observation").model_dump())
    if cams:
        sources.append(SRC["open_meteo"].src(as_of=cams.as_of, kind="model").model_dump())
    if cf_hit:
        sources.append(SRC["geos_cf"].src(as_of=cf_hit.value.get("run"), kind="forecast").model_dump())
    if stations and pm25_source != "openaq":
        sources.append(SRC["openaq"].src(as_of=stations[0]["as_of"], kind="observation").model_dump())

    # Forecast: GEOS-CF daily means, else CAMS
    forecast = []
    cams_daily = _daily(cams.value["hourly"], "pm25") if cams else {}
    today = now.date().isoformat()
    days = sorted(d for d in set(cf_daily) | set(cams_daily) if d >= today)[:5]
    for d in days:
        if d in cf_daily:
            v, src = cf_daily[d], "geos_cf"
        else:
            v, src = cams_daily[d], "open_meteo"
        da = A.aqi_pm25(v)
        forecast.append({"date": d, "pm25": v, "aqi": da, "category": A.category(da), "source": src})

    return {
        "pm25": round(pm25, 1),
        "pm25_source": pm25_source,
        "pm25_kind": pm25_kind,
        "nasa_pm25": nasa_now,
        "aqi": aqi,
        "category": cat,
        "dominant": "pm10" if a10 > a25 else "pm25",
        "forecast": forecast,
        "stations": stations,
        "stations_enabled": bool(settings.openaq_api_key),
        "my_sensors": [sensor_summary(s, now) for s in my],
        "advice": A.advice(cat),
        "meta": {
            "live": bool(cams and cams.fresh),
            "stale": bool(cams and cams.stale),
            "generated_at": now.isoformat(),
            "sources": sources,
        },
    }


# ── worker side ─────────────────────────────────────────────────────────────


async def refresh_cf(db: AsyncSession, lat: float, lng: float) -> dict:
    s = await geos.cf_pm25(lat, lng)
    await cache.write(
        db,
        cf_key(lat, lng),
        "geos_cf",
        {"run": s["run"], "hours": s["hours"], "grid": s["grid"]},
        CF_TTL,
        as_of=s["run"],
    )
    return {"run": s["run"], "hours": len(s["hours"])}


async def refresh_stations(db: AsyncSession, lat: float, lng: float) -> dict:
    from ..providers import openaq

    locs = await openaq.locations(lat, lng)
    locs.sort(key=lambda s: haversine_m(lat, lng, s["lat"], s["lng"]))
    out = []
    for loc in locs[:8]:
        try:
            latest = await openaq.latest(loc["id"])
        except UpstreamError:
            continue
        vals = [r for r in latest if r["sensor_id"] in loc["sensor_ids"] and r["value"] is not None and r["value"] >= 0]
        if not vals:
            continue
        r = max(vals, key=lambda x: x["datetime"] or "")
        out.append(
            {
                "name": loc["name"],
                "lat": loc["lat"],
                "lng": loc["lng"],
                "pm25": round(float(r["value"]), 1),
                "as_of": r["datetime"],
                "provider": loc.get("provider"),
            }
        )
    as_of = max((s["as_of"] for s in out if s["as_of"]), default=None)
    await cache.write(db, stations_key(lat, lng), "openaq", {"stations": out}, STATIONS_TTL, as_of=as_of)
    return {"stations": len(out)}
