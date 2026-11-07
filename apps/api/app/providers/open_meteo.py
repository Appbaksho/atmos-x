"""Open-Meteo forecast and air quality (prompt-v1 §5.2). Not NASA. CC BY 4.0.

Free tier: non-commercial, < 10,000 calls a day. With OPEN_METEO_API_KEY set, the customer hosts
are used with `apikey=` (Check: customer-api.open-meteo.com per the pricing page).
"""

from __future__ import annotations

from ..config import settings
from ..http import get_json

PROVIDER = "open_meteo"


def _host(kind: str) -> str:
    paid = bool(settings.open_meteo_api_key)
    if kind == "forecast":
        return "https://customer-api.open-meteo.com/v1/forecast" if paid else "https://api.open-meteo.com/v1/forecast"
    if kind == "air":
        return (
            "https://customer-air-quality-api.open-meteo.com/v1/air-quality"
            if paid
            else "https://air-quality-api.open-meteo.com/v1/air-quality"
        )
    if kind == "geocoding":
        return (
            "https://customer-geocoding-api.open-meteo.com/v1/search"
            if paid
            else "https://geocoding-api.open-meteo.com/v1/search"
        )
    raise ValueError(kind)


def _params(p: dict) -> dict:
    if settings.open_meteo_api_key:
        p = {**p, "apikey": settings.open_meteo_api_key}
    return p


def cell(lat: float, lng: float, step: float = 0.01) -> tuple[float, float]:
    """Snap to ~1 km so nearby requests share the cache."""
    return round(round(lat / step) * step, 4), round(round(lng / step) * step, 4)


async def forecast(lat: float, lng: float, *, timeout: float = 4.0, retries: int = 0) -> dict:
    j = await get_json(
        PROVIDER,
        _host("forecast"),
        params=_params(
            {
                "latitude": lat,
                "longitude": lng,
                "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,is_day,apparent_temperature",
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,wind_speed_10m_max,et0_fao_evapotranspiration,weather_code,relative_humidity_2m_mean",
                "hourly": "temperature_2m,relative_humidity_2m,cape,precipitation_probability,weather_code",
                "forecast_days": 7,
                "past_days": 3,
                "timezone": "auto",
            }
        ),
        timeout=timeout,
        retries=retries,
    )
    return parse_forecast(j)


def _num(v):
    return None if v is None else float(v)


def parse_forecast(j: dict) -> dict:
    d, h, c = j["daily"], j["hourly"], j["current"]
    return {
        "timezone": j.get("timezone"),
        "utc_offset_sec": j.get("utc_offset_seconds", 0),
        "current": {
            "time": c["time"],
            "temp": _num(c.get("temperature_2m")),
            "rh": _num(c.get("relative_humidity_2m")),
            "wind": _num(c.get("wind_speed_10m")),
            "code": c.get("weather_code"),
            "is_day": c.get("is_day", 1) == 1,
        },
        "daily": [
            {
                "date": t,
                "tmax": _num(d["temperature_2m_max"][i]),
                "tmin": _num(d["temperature_2m_min"][i]),
                "rain": _num(d["precipitation_sum"][i]),
                "rain_prob": _num(d["precipitation_probability_max"][i]),
                "gust": _num(d["wind_gusts_10m_max"][i]),
                "wind": _num(d["wind_speed_10m_max"][i]),
                "et0": _num(d["et0_fao_evapotranspiration"][i]),
                "code": d["weather_code"][i],
                "rh": _num(d.get("relative_humidity_2m_mean", [None] * len(d["time"]))[i]),
            }
            for i, t in enumerate(d["time"])
        ],
        "hourly": [
            {
                "time": t,
                "temp": _num(h["temperature_2m"][i]),
                "rh": _num(h["relative_humidity_2m"][i]),
                "cape": _num(h["cape"][i]),
                "precip_prob": _num(h["precipitation_probability"][i]),
                "code": h["weather_code"][i],
            }
            for i, t in enumerate(h["time"])
        ],
    }


async def air(lat: float, lng: float, *, timeout: float = 4.0, retries: int = 0) -> dict:
    j = await get_json(
        PROVIDER,
        _host("air"),
        params=_params(
            {
                "latitude": lat,
                "longitude": lng,
                "current": "pm2_5,pm10",
                "hourly": "pm2_5,pm10",
                "forecast_days": 5,
                "timezone": "auto",
            }
        ),
        timeout=timeout,
        retries=retries,
    )
    h = j.get("hourly", {})
    return {
        "timezone": j.get("timezone"),
        "current": {
            "time": j.get("current", {}).get("time"),
            "pm25": _num(j.get("current", {}).get("pm2_5")),
            "pm10": _num(j.get("current", {}).get("pm10")),
        },
        "hourly": [
            {"time": t, "pm25": _num(h["pm2_5"][i]), "pm10": _num(h["pm10"][i])}
            for i, t in enumerate(h.get("time", []))
        ],
    }


async def geocode(q: str, lang: str, *, timeout: float = 4.0) -> list[dict]:
    j = await get_json(
        PROVIDER,
        _host("geocoding"),
        params=_params({"name": q, "count": 8, "language": lang, "format": "json"}),
        timeout=timeout,
    )
    return [
        {
            "name": r["name"],
            "admin": r.get("admin1") or r.get("admin2"),
            "country": r.get("country"),
            "country_code": (r.get("country_code") or "").upper() or None,
            "location": {"lat": r["latitude"], "lng": r["longitude"]},
        }
        for r in j.get("results", []) or []
    ]
