"""US EPA AQI, 2024 PM2.5 breakpoints (prompt-v1 §7.8). Ported from V0 air/aqi.ts."""

from __future__ import annotations

import math

PM25_BREAKPOINTS = [
    (0.0, 9.0, 0, 50),
    (9.1, 35.4, 51, 100),
    (35.5, 55.4, 101, 150),
    (55.5, 125.4, 151, 200),
    (125.5, 225.4, 201, 300),
    (225.5, 325.4, 301, 500),
]
PM10_BREAKPOINTS = [
    (0, 54, 0, 50),
    (55, 154, 51, 100),
    (155, 254, 101, 150),
    (255, 354, 151, 200),
    (355, 424, 201, 300),
    (425, 604, 301, 500),
]


def _aqi(c: float, bps, decimals: int) -> int:
    f = 10**decimals
    t = math.floor(max(0.0, c) * f) / f
    if t > bps[-1][1]:
        return 500
    bp = next((b for b in bps if b[0] <= t <= b[1]), None) or next((b for b in bps if t <= b[1]), bps[-1])
    clo, chi, ilo, ihi = bp
    return round((ihi - ilo) / (chi - clo) * (t - clo) + ilo)


def aqi_pm25(c: float) -> int:
    return _aqi(c, PM25_BREAKPOINTS, 1)


def aqi_pm10(c: float) -> int:
    return _aqi(c, PM10_BREAKPOINTS, 0)


def category(aqi: int) -> str:
    if aqi <= 50:
        return "good"
    if aqi <= 100:
        return "moderate"
    if aqi <= 150:
        return "usg"
    if aqi <= 200:
        return "unhealthy"
    if aqi <= 300:
        return "very_unhealthy"
    return "hazardous"


ADVICE = {
    "good": ["advice.air.enjoy_outdoors", "advice.air.ventilate"],
    "moderate": ["advice.air.sensitive_watch", "advice.air.ventilate_off_peak"],
    "usg": ["advice.air.sensitive_reduce", "advice.air.windows_peak", "advice.air.mask_sensitive"],
    "unhealthy": ["advice.air.reduce_outdoor", "advice.air.mask_n95", "advice.air.windows_closed"],
    "very_unhealthy": [
        "advice.air.avoid_outdoor",
        "advice.air.mask_n95",
        "advice.air.windows_closed",
        "advice.air.purifier",
    ],
    "hazardous": ["advice.air.stay_indoors", "advice.air.mask_n95", "advice.air.windows_closed", "advice.air.purifier"],
}


def advice(cat: str) -> list[dict]:
    return [{"code": c} for c in ADVICE[cat]]
