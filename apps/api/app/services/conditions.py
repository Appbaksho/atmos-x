"""How hot is it now? (prompt-v1 §7.7, §9 GET /conditions)

Request path: Open-Meteo current/forecast (cached 30 min, stale up to 24 h) and the stored place
label. Everything NASA comes from caches the worker fills: POWER normal (30 days) and recent days
(6 h), GEOS-FP forecast (6 h, served up to 24 h). A missing cache enqueues its job and the field is
null until it lands, never guessed.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from ..engines import weather as W
from ..http import UpstreamError
from ..providers import geos, power
from ..sources import SRC
from . import cache, geo, jobs
from .conditions_now import forecast

NORMAL_TTL = timedelta(days=30)
RECENT_TTL = timedelta(hours=6)
GEOS_TTL = timedelta(hours=6)
GEOS_STALE = timedelta(hours=24)


def normal_key(lat: float, lng: float) -> str:
    a, b = power.half_degree(lat, lng)
    return f"power:normal:{a},{b}"


def recent_key(lat: float, lng: float) -> str:
    a, b = round(lat, 1), round(lng, 1)
    return f"power:recent:{a},{b}"


def geos_key(lat: float, lng: float) -> str:
    la, lo = geos.fp_index(lat, lng)
    return f"geosfp:{la},{lo}"


def local_today(fc: dict) -> str:
    return fc["current"]["time"][:10]


def noon_rh(fc: dict, day: str) -> float:
    """Relative humidity near 13:00 local (Open-Meteo hourly times are local with timezone=auto)."""
    best = None
    for h in fc["hourly"]:
        if h["time"].startswith(day) and h["rh"] is not None:
            hr = int(h["time"][11:13])
            if best is None or abs(hr - 13) < abs(best[0] - 13):
                best = (hr, h["rh"])
    if best:
        return best[1]
    for d in fc["daily"]:
        if d["date"] == day and d.get("rh") is not None:
            return d["rh"]
    return 60.0


async def _cached_or_enqueue(
    db: AsyncSession, key: str, kind: str, payload: dict, stale_ok: timedelta | None = None
) -> cache.Cached | None:
    hit = await cache.peek(db, key)
    if hit is None or not hit.fresh:
        await jobs.enqueue(db, kind, key, payload, priority=5, max_attempts=3)
        await db.commit()
    if hit is None:
        return None
    if not hit.fresh and stale_ok is not None and datetime.now(UTC) - hit.fetched_at > stale_ok:
        return None
    return hit


def merge_forecast(
    om_days: list[dict], geos_days: dict[str, dict] | None, bd: bool, fc: dict, today: str, n: int = 5
) -> list[dict]:
    """GEOS-FP local-day Tmax/Tmin with the sanity rule; Open-Meteo otherwise. Each day names its source."""
    out = []
    for d in [x for x in om_days if x["date"] >= today][:n]:
        tmax, tmin, src, disagree = d["tmax"], d["tmin"], "open_meteo", False
        g = (geos_days or {}).get(d["date"])
        if g and g.get("n", 0) >= 18 and tmax is not None and tmin is not None:
            gmax_ok = abs(g["tmax"] - tmax) <= W.FORECAST_DISAGREE_C
            gmin_ok = abs(g["tmin"] - tmin) <= W.FORECAST_DISAGREE_C
            if gmax_ok:
                tmax = g["tmax"]
            if gmin_ok:
                tmin = g["tmin"]
            disagree = not (gmax_ok and gmin_ok)
            src = "geos_fp" if gmax_ok and gmin_ok else ("geos_fp+open_meteo" if gmax_ok or gmin_ok else "open_meteo")
        if tmax is None:
            continue
        feels = W.heat_index(tmax, noon_rh(fc, d["date"]))
        out.append(
            {
                "date": d["date"],
                "tmax_c": round(tmax, 1),
                "tmin_c": round(tmin, 1) if tmin is not None else None,
                "feels_max_c": round(feels, 1),
                "rain_mm": round(d["rain"] or 0, 1),
                "bmd_level": W.bmd_heat(tmax) if bd else None,
                "cold_level": W.bmd_cold(tmin) if bd else None,
                "rain_class": W.bmd_rain(d["rain"]) if bd else None,
                "heat_risk": W.heat_risk(feels),
                "source": src,
                "disagreement": disagree,
            }
        )
    return out


def warnings_for(days: list[dict], bd: bool) -> list[dict]:
    """Computed by Atmos X (source 'local'): BMD bands in Bangladesh, NOAA heat-index bands elsewhere."""
    nxt = days[:3]
    out: list[dict] = []
    if bd:
        hits = [d for d in nxt if d["bmd_level"]]
        if hits:
            top = max(hits, key=lambda d: W.BMD_ORDER[d["bmd_level"]])
            out.append(
                {
                    "source": "local",
                    "level": top["bmd_level"],
                    "text": {
                        "code": f"warning.heatwave_{top['bmd_level']}",
                        "params": {"tmax": round(top["tmax_c"]), "day": top["date"], "until": hits[-1]["date"]},
                    },
                    "until": hits[-1]["date"],
                }
            )
        cold = [d for d in nxt if d.get("cold_level")]
        if cold:
            top = max(cold, key=lambda d: W.BMD_ORDER[d["cold_level"]])
            out.append(
                {
                    "source": "local",
                    "level": top["cold_level"],
                    "text": {
                        "code": f"warning.coldwave_{top['cold_level']}",
                        "params": {"tmin": round(top["tmin_c"]), "day": top["date"], "until": cold[-1]["date"]},
                    },
                    "until": cold[-1]["date"],
                }
            )
        return out
    hot = [d for d in nxt if d["heat_risk"] in ("danger", "xdanger")]
    if hot:
        top = max(hot, key=lambda d: d["feels_max_c"])
        extreme = top["heat_risk"] == "xdanger"
        out.append(
            {
                "source": "local",
                "level": "danger" if extreme else "warning",
                "text": {
                    "code": "warning.heat_extreme" if extreme else "warning.heat_danger",
                    "params": {"feels": round(top["feels_max_c"]), "day": top["date"]},
                },
                "until": hot[-1]["date"],
            }
        )
    return out


async def conditions(db: AsyncSession, lat: float, lng: float, lang: str) -> dict:
    bd = W.in_bangladesh(lat, lng)
    fc_c = await forecast(db, lat, lng)  # raises UpstreamError when Open-Meteo is down and nothing is cached
    fc = fc_c.value
    today = local_today(fc)
    place = await geo.reverse(db, lat, lng, lang, timeout=2.0)
    cur = fc["current"]
    air = cur["temp"]
    feels = W.heat_index(air, cur["rh"] or 0) if air is not None else None

    sources = [SRC["open_meteo"].src(as_of=fc_c.as_of, kind="model").model_dump()]
    nlat, nlng = power.half_degree(lat, lng)
    normal_hit = await _cached_or_enqueue(db, normal_key(lat, lng), "power_normal", {"lat": nlat, "lng": nlng})
    recent_hit = await _cached_or_enqueue(
        db, recent_key(lat, lng), "power_recent", {"lat": round(lat, 1), "lng": round(lng, 1)}
    )
    geos_hit = await _cached_or_enqueue(
        db, geos_key(lat, lng), "geos_fp", {"lat": lat, "lng": lng}, stale_ok=GEOS_STALE
    )

    days = merge_forecast(fc["daily"], geos_hit.value.get("days") if geos_hit else None, bd, fc, today)
    if geos_hit and any(d["source"].startswith("geos_fp") for d in days):
        sources.append(SRC["geos_fp"].src(as_of=geos_hit.value.get("run"), kind="forecast").model_dump())

    normal_c = anomaly_c = None
    if normal_hit:
        normals = normal_hit.value.get("normals", {})
        mmdd = today[5:]
        normal_c = normals.get(mmdd)
        if normal_c is not None and days:
            anomaly_c = round(days[0]["tmax_c"] - normal_c, 1)
        sources.append(SRC["power"].src(as_of=normal_hit.value.get("period"), kind="derived").model_dump())
    recent = []
    if recent_hit:
        recent = recent_hit.value.get("days", [])[-7:]
        if not normal_hit:
            sources.append(SRC["power"].src(as_of=recent_hit.as_of, kind="model").model_dump())
    tmax_today = days[0]["tmax_c"] if days else air
    tmin_today = days[0]["tmin_c"] if days else None
    bmd_today = W.bmd_heat(tmax_today) if bd else None
    if bmd_today:
        sources.append(SRC["bmd_thresholds"].src(kind="reference").model_dump())
    return {
        "place": place["place"],
        "time": cur["time"],
        "air_c": round(air, 1) if air is not None else None,
        "feels_c": round(feels, 1) if feels is not None else None,
        "humidity": round(cur["rh"]) if cur["rh"] is not None else None,
        "wind_kmh": round(cur["wind"], 1) if cur["wind"] is not None else None,
        "heat_risk": W.heat_risk(feels) if feels is not None else "ok",
        "bmd_level": bmd_today,
        "cold_level": W.bmd_cold(tmin_today) if bd else None,
        "normal_c": normal_c,
        "anomaly_c": anomaly_c,
        "normal_status": "ready" if normal_hit else "pending",
        "recent": recent,
        "forecast": days,
        "warnings": warnings_for(days, bd),
        "meta": {
            "live": fc_c.fresh,
            "stale": fc_c.stale,
            "generated_at": datetime.now(UTC).isoformat(),
            "sources": sources,
        },
    }


# ── worker side ─────────────────────────────────────────────────────────────


async def refresh_normal(db: AsyncSession, lat: float, lng: float) -> dict:
    """Daily T2M_MAX 2001-01-01..2025-12-31 → mean Tmax per day-of-year ± 7 (all 366 MM-DD keys)."""
    data = await power.daily(lat, lng, date(2001, 1, 1), date(2025, 12, 31), ["T2M_MAX", "PRECTOTCORR"], timeout=120)
    series = data["values"]["T2M_MAX"]
    rain = data["values"].get("PRECTOTCORR", {})
    yearly: dict[str, list[float]] = {}
    for k, v in rain.items():
        yearly.setdefault(k[:4], []).append(v)
    full = [sum(v) for v in yearly.values() if len(v) >= 360]
    annual_rain = round(sum(full) / len(full)) if full else None
    normals = {}
    d = date(2024, 1, 1)  # a leap year, so 02-29 has a key
    while d.year == 2024:
        v = W.normal_for(series, d)
        if v is not None:
            normals[d.strftime("%m-%d")] = v
        d += timedelta(days=1)
    value = {
        "normals": normals,
        "period": "2001–2025",
        "units": data["units"].get("T2M_MAX"),
        "n_days": len(series),
        "annual_rain_mm": annual_rain,
    }
    await cache.write(db, normal_key(lat, lng), "power", value, NORMAL_TTL, as_of="2025-12-31")
    return {"normals": len(normals)}


async def refresh_recent(db: AsyncSession, lat: float, lng: float) -> dict:
    end = datetime.now(UTC).date()
    data = await power.daily(lat, lng, end - timedelta(days=31), end, ["T2M_MAX", "T2M_MIN", "PRECTOTCORR"], timeout=60)
    v = data["values"]
    days = sorted(set(v["T2M_MAX"]) & set(v["T2M_MIN"]))
    out = [
        {
            "date": f"{k[:4]}-{k[4:6]}-{k[6:]}",
            "tmax_c": round(v["T2M_MAX"][k], 1),
            "tmin_c": round(v["T2M_MIN"][k], 1),
            "rain_mm": round(v["PRECTOTCORR"].get(k, 0.0), 1) if k in v["PRECTOTCORR"] else None,
        }
        for k in days
    ]
    as_of = out[-1]["date"] if out else None
    await cache.write(db, recent_key(lat, lng), "power", {"days": out}, RECENT_TTL, as_of=as_of)
    return {"days": len(out), "as_of": as_of}


async def refresh_geos_fp(db: AsyncSession, lat: float, lng: float) -> dict:
    fc = None
    try:
        fc = (await forecast(db, lat, lng, timeout=10)).value
    except UpstreamError:
        pass
    offset = fc["utc_offset_sec"] if fc else round(lng / 15) * 3600
    series = await geos.fp_series(lat, lng)
    hours = [(datetime.fromisoformat(h["time"]), h["t_c"]) for h in series["hours"] if h["t_c"] is not None]
    days = W.local_days(hours, offset)
    value = {"run": series["run"], "grid": series["grid"], "days": days}
    await cache.write(db, geos_key(lat, lng), "geos_fp", value, GEOS_TTL, as_of=series["run"])
    return {"run": series["run"], "days": len(days)}
