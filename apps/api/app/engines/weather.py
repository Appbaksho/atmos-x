"""Weather maths (prompt-v1 §7.7). Pure functions; ported from V0 weather/*.ts and extended.

BMD thresholds were verified from an official BMD bulletin (Apr 2026). BMD is reviewing its rain
classes, so all of these live in config here. Only `source: 'BMD'` may be called official, and
only for a real bulletin; warnings computed here are `source: 'local'`.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, timedelta

BMD = {
    # Heat wave by Tmax (°C): mild 36.0–37.9, moderate 38.0–39.9, severe 40.0–41.9, very severe ≥ 42.0
    "heat": [(42.0, "very_severe"), (40.0, "severe"), (38.0, "moderate"), (36.0, "mild")],
    # Cold wave by Tmin (°C): mild 8.1–10.0, moderate 6.1–8.0, severe 4.1–6.0, very severe ≤ 4.0
    "cold": [(4.0, "very_severe"), (6.0, "severe"), (8.0, "moderate"), (10.0, "mild")],
    # Rain per 24 h (mm): light 1–10, moderate 11–22, moderately heavy 23–43, heavy 44–88, very heavy > 88
    "rain": [(44.0, "heavy"), (23.0, "moderately_heavy"), (11.0, "moderate"), (1.0, "light")],
    "rain_very_heavy_above": 88.0,
}
BMD_ORDER = {"mild": 1, "moderate": 2, "severe": 3, "very_severe": 4}

# GEOS-FP vs Open-Meteo sanity rule (§7.7): differences above this use Open-Meteo.
FORECAST_DISAGREE_C = 3.0
# A normal is the mean daily Tmax for day-of-year ± this many days over 2001–2025 (§5.2 POWER).
NORMAL_WINDOW_DAYS = 7
POWER_FILL = -999.0
GEOS_FILL = 1.0e15


def heat_index(t_c: float, rh: float) -> float:
    """Steadman/NOAA heat index (°C). Returns the air temperature below 80 °F."""
    t = t_c * 9 / 5 + 32
    if t < 80:
        return t_c
    hi = (
        -42.379
        + 2.04901523 * t
        + 10.14333127 * rh
        - 0.22475541 * t * rh
        - 0.00683783 * t * t
        - 0.05481717 * rh * rh
        + 0.00122874 * t * t * rh
        + 0.00085282 * t * rh * rh
        - 0.00000199 * t * t * rh * rh
    )
    return round((hi - 32) * 5 / 9, 1)


def heat_risk(feels_c: float) -> str:
    if feels_c >= 54:
        return "xdanger"
    if feels_c >= 41:
        return "danger"
    if feels_c >= 32:
        return "xcaution"
    if feels_c >= 27:
        return "caution"
    return "ok"


def bmd_heat(tmax_c: float | None) -> str | None:
    if tmax_c is None:
        return None
    for thr, lvl in BMD["heat"]:
        if tmax_c >= thr:
            return lvl
    return None


def bmd_cold(tmin_c: float | None) -> str | None:
    if tmin_c is None:
        return None
    for thr, lvl in BMD["cold"]:
        if tmin_c <= thr:
            return lvl
    return None


def bmd_rain(mm: float | None) -> str | None:
    if mm is None:
        return None
    if mm > BMD["rain_very_heavy_above"]:
        return "very_heavy"
    for thr, lvl in BMD["rain"]:
        if mm >= thr:
            return lvl
    return None


# Simplified outline of Bangladesh (lng, lat), ~10 km accuracy: enough to decide if BMD bands apply.
BD_POLYGON = [
    (88.01, 24.3), (88.15, 24.85), (88.45, 25.2), (88.08, 25.82), (88.25, 26.4), (88.52, 26.37),
    (89.05, 26.39), (89.36, 26.0), (89.85, 25.29), (90.4, 25.15), (91.2, 25.2), (92.0, 25.2),
    (92.4, 24.95), (92.2, 24.6), (92.1, 24.2), (91.9, 24.15), (91.75, 23.7), (91.62, 23.15),
    (91.85, 23.3), (92.0, 23.55), (92.3, 23.65), (92.39, 23.0), (92.6, 22.1), (92.68, 21.3),
    (92.3, 20.6), (92.0, 21.1), (91.8, 22.1), (91.4, 22.7), (90.6, 22.1), (90.3, 21.8),
    (89.85, 21.7), (89.0, 21.6), (88.95, 22.05), (89.05, 22.9), (88.75, 23.3), (88.55, 23.65),
    (88.7, 24.05), (88.3, 24.3), (88.01, 24.3),
]  # fmt: skip


def in_bangladesh(lat: float, lng: float) -> bool:
    if lat < 20.5 or lat > 26.7 or lng < 88.0 or lng > 92.7:
        return False
    inside = False
    j = len(BD_POLYGON) - 1
    for i in range(len(BD_POLYGON)):
        xi, yi = BD_POLYGON[i]
        xj, yj = BD_POLYGON[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def magnus_rh(t_c: float, td_c: float) -> float:
    """Relative humidity (%) from temperature and dew point (Magnus formula, over water)."""
    a, b = 17.625, 243.04
    rh = 100 * math.exp(a * td_c / (b + td_c)) / math.exp(a * t_c / (b + t_c))
    return max(0.0, min(100.0, rh))


def normal_for(daily_tmax: dict[str, float], day: date, window: int = NORMAL_WINDOW_DAYS) -> float | None:
    """Mean daily Tmax for day-of-year ± window across all years in `daily_tmax` (YYYYMMDD → °C).

    POWER fills (−999) must already be removed. Feb 29 maps onto Feb 28's neighbourhood.
    """
    target = day.timetuple().tm_yday
    vals: list[float] = []
    for k, v in daily_tmax.items():
        if v is None or v <= POWER_FILL + 1:
            continue
        d = date(int(k[:4]), int(k[4:6]), int(k[6:8]))
        doy = d.timetuple().tm_yday
        diff = abs(doy - target)
        diff = min(diff, 365 - diff)
        if diff <= window:
            vals.append(v)
    return round(sum(vals) / len(vals), 1) if vals else None


def clean_power(series: dict[str, float]) -> dict[str, float]:
    return {k: float(v) for k, v in series.items() if v is not None and float(v) > POWER_FILL + 1}


def local_days(hourly: list[tuple[datetime, float]], utc_offset_s: int) -> dict[str, dict]:
    """Aggregate UTC-stamped hourly values to local days: {date: {tmax, tmin, n}}."""
    acc: dict[str, list[float]] = defaultdict(list)
    for t, v in hourly:
        if v is None or not math.isfinite(v) or abs(v) >= GEOS_FILL / 10:
            continue
        d = (t + timedelta(seconds=utc_offset_s)).date().isoformat()
        acc[d].append(v)
    return {d: {"tmax": round(max(v), 1), "tmin": round(min(v), 1), "n": len(v)} for d, v in acc.items()}


def summarize_hot_season(monthly_tmax: dict[int, list[float]]) -> list[int]:
    """The 3 hottest consecutive months (1–12, wrapping) by mean Tmax."""
    means = {m: (sum(v) / len(v)) for m, v in monthly_tmax.items() if v}
    if len(means) < 12:
        return [4, 5, 6]
    best, best_m = -1e9, 4
    for m in range(1, 13):
        ms = [((m - 1 + i) % 12) + 1 for i in range(3)]
        s = sum(means[x] for x in ms)
        if s > best:
            best, best_m = s, m
    return [((best_m - 1 + i) % 12) + 1 for i in range(3)]
