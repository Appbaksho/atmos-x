"""Farmer alerts (prompt-v1 §7.9), ported from V0 `src/server/farm/alerts.ts` (itself from the Expo
prototype). Pure: inputs in, alert drafts out. Thresholds follow BMD / BRRI / DAE advisories; the
drought thresholds on SMAP soil wetness are rules of thumb and labelled so.

Rules: haor flash flood, rice heat at flowering, drought / dry spell, storm, cold wave (4 BMD bands),
potato late blight, monsoon onset, lightning (weighted by LIS/OTD climatology), heat for field
workers, and heavy rain (BMD 24 h classes, forecast and the last 72 h from IMERG).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from .weather import BMD, bmd_cold, bmd_rain, heat_index

CROPS = ["boro", "aman", "aus", "potato", "wheat", "maize", "jute", "vegetables"]
STAGES = ["seedbed", "vegetative", "flowering", "ripening", "harvest"]
RICE = {"boro", "aman", "aus"}
LEVEL_ORDER = {"danger": 0, "warning": 1, "watch": 2, "info": 3}

CFG = {
    # 1. Haor flash flood (Mar–Jun): 3-day rain locally or upstream in Meghalaya.
    "haor_months": (3, 6),
    "haor_local_mm": 100,
    "haor_up_mm": 150,
    "haor_local_danger_mm": 150,
    "haor_up_danger_mm": 250,
    # 2. Rice spikelet sterility above ~35 °C at flowering.
    "rice_heat_c": 35.0,
    "rice_heat_danger_c": 38.0,
    # 3. Drought. SMAP root-zone wetness (0–1) is a rule of thumb: < 0.30 dry, < 0.20 very dry.
    "smap_watch": 0.30,
    "smap_warning": 0.20,
    "rain30_watch_mm": 25,
    "rain30_warning_mm": 10,
    "rain7_max_mm": 10,
    "et7_min_mm": 20,
    # 4. Storm: gusts ≥ 62 km/h or sustained ≥ 45 km/h; danger at ≥ 89 km/h gusts.
    "storm_gust_kmh": 62,
    "storm_wind_kmh": 45,
    "storm_danger_gust_kmh": 89,
    # 6. Late blight: RH ≥ 90 % and 10–25 °C for ≥ 10 h a day, two days in a row.
    "blight_rh": 90,
    "blight_t": (10.0, 25.0),
    "blight_hours": 10,
    # 7. Monsoon onset (May–Jul): three days in a row with ≥ 10 mm.
    "monsoon_months": (5, 7),
    "monsoon_wet_mm": 10,
    "monsoon_run": 3,
    # 8. Lightning: CAPE ≥ 2000 J/kg with ≥ 50 % rain chance (danger 3000 / 70 %), scaled by climatology.
    "cape": 2000,
    "cape_prob": 50,
    "cape_danger": 3000,
    "cape_danger_prob": 70,
    "thunder_codes": (95, 96, 99),
    # 9. Field-worker heat: heat index ≥ 41 °C (danger ≥ 54 °C).
    "worker_hi": 41.0,
    "worker_hi_danger": 54.0,
}

UPSTREAM_CHERRAPUNJI = (25.27, 91.73)


def region_of(lat: float, lng: float) -> dict:
    return {
        "haor": 24.0 <= lat <= 25.3 and 90.6 <= lng <= 92.0,
        "coastal": lat <= 22.95 and 89.0 <= lng <= 92.4,
        "north": lat >= 24.3 and lng <= 89.9,
    }


def region_name(lat: float, lng: float) -> str | None:
    r = region_of(lat, lng)
    return "haor" if r["haor"] else "coastal" if r["coastal"] else "north" if r["north"] else None


@dataclass
class Inputs:
    """Forecast days from today (Open-Meteo daily/hourly), plus optional NASA context."""

    daily: list[dict]
    hourly: list[dict]
    lat: float
    lng: float
    crop: str
    stage: str
    month: int
    upstream_daily: list[dict] | None = None
    rain30_mm: float | None = None  # NASA POWER, past 30 days
    imerg_72h_mm: float | None = None  # NASA IMERG, last 3 complete days
    imerg_max_day_mm: float | None = None
    imerg_last_day: str | None = None
    smap_rootzone: float | None = None  # SMAP L4 root-zone wetness 0–1
    lightning_weight: float = 1.0  # LIS/OTD climatology relative to Dhaka's pre-monsoon, 0.5–2
    lightning_rate: float | None = None
    used: set[str] = field(default_factory=set)


def _a3(rule: str, first: str = "a1") -> list[dict]:
    return [{"code": f"farm.{rule}.{first}"}, {"code": f"farm.{rule}.a2"}, {"code": f"farm.{rule}.a3"}]


def _sum(xs) -> float:
    return float(sum(x or 0 for x in xs))


def _draft(rule, hazard, level, emoji, title, body, actions, frm, to, sources=()) -> dict:
    return {
        "rule": rule,
        "hazard": hazard,
        "level": level,
        "emoji": emoji,
        "title": title,
        "body": body,
        "actions": actions,
        "from": frm,
        "to": to if to >= frm else frm,
        "sources": list(sources),
    }


def rules(x: Inputs) -> list[dict]:
    d = [day for day in x.daily if day.get("tmax") is not None]
    if not d:
        return []
    out: list[dict] = []
    first, last = d[0]["date"], d[-1]["date"]
    region = region_of(x.lat, x.lng)
    rains = [day.get("rain") or 0 for day in d]

    # 1. Haor flash flood
    lo, hi = CFG["haor_months"]
    if region["haor"] and lo <= x.month <= hi:
        local3 = max(_sum(rains[i : i + 3]) for i in range(min(5, len(rains))))
        if x.imerg_72h_mm is not None:
            local3 = max(local3, x.imerg_72h_mm)
        up = [day.get("rain") or 0 for day in (x.upstream_daily or [])]
        up3 = max((_sum(up[i : i + 3]) for i in range(min(5, len(up)))), default=0.0)
        if local3 >= CFG["haor_local_mm"] or up3 >= CFG["haor_up_mm"]:
            srcs = ["open_meteo_upstream"] if x.upstream_daily else []
            if x.imerg_72h_mm is not None:
                srcs.append("imerg")
            danger = local3 >= CFG["haor_local_danger_mm"] or up3 >= CFG["haor_up_danger_mm"]
            out.append(
                _draft(
                    "haor_flood",
                    "flood",
                    "danger" if danger else "warning",
                    "🌊",
                    {"code": "farm.haor_flood.title"},
                    {"code": "farm.haor_flood.body", "params": {"local_mm": round(local3), "up_mm": round(up3)}},
                    _a3("haor_flood"),
                    first,
                    d[min(4, len(d) - 1)]["date"],
                    srcs,
                )
            )

    # 2. Rice heat at flowering
    hot = [day for day in d if day["tmax"] >= CFG["rice_heat_c"]]
    if x.crop in RICE and x.stage in ("flowering", "vegetative") and hot:
        peak = max(day["tmax"] for day in hot)
        lvl = ("danger" if peak >= CFG["rice_heat_danger_c"] else "warning") if x.stage == "flowering" else "watch"
        out.append(
            _draft(
                "rice_heat",
                "heat",
                lvl,
                "🔥",
                {"code": "farm.rice_heat.title"},
                {
                    "code": "farm.rice_heat.body",
                    "params": {"days": len(hot), "peak": round(peak, 1), "day": hot[0]["date"]},
                },
                _a3("rice_heat"),
                hot[0]["date"],
                hot[-1]["date"],
            )
        )

    # 3. Drought: SMAP root-zone wetness first; NASA POWER 30-day rain + Open-Meteo ET0 as fallback.
    rain7 = _sum(rains)
    et7 = _sum(day.get("et0") for day in d)
    if x.crop != "potato" and rain7 < CFG["rain7_max_mm"]:
        if x.smap_rootzone is not None:
            if x.smap_rootzone < CFG["smap_watch"]:
                lvl = "warning" if x.smap_rootzone < CFG["smap_warning"] else "watch"
                out.append(
                    _draft(
                        "drought",
                        "drought",
                        lvl,
                        "🏜️",
                        {"code": "farm.drought.title"},
                        {
                            "code": "farm.drought.body_smap",
                            "params": {"wet_pct": round(x.smap_rootzone * 100), "rain7": round(rain7)},
                        },
                        _a3("drought"),
                        first,
                        last,
                        ["smap"],
                    )
                )
        elif x.rain30_mm is not None and x.rain30_mm < CFG["rain30_watch_mm"] and et7 > CFG["et7_min_mm"]:
            lvl = "warning" if x.rain30_mm < CFG["rain30_warning_mm"] else "watch"
            out.append(
                _draft(
                    "drought",
                    "drought",
                    lvl,
                    "🏜️",
                    {"code": "farm.drought.title"},
                    {
                        "code": "farm.drought.body",
                        "params": {"rain30": round(x.rain30_mm), "rain7": round(rain7), "et7": round(et7)},
                    },
                    _a3("drought"),
                    first,
                    last,
                    ["power"],
                )
            )

    # 4. Storm
    storm = [
        day
        for day in d
        if (day.get("gust") or 0) >= CFG["storm_gust_kmh"] or (day.get("wind") or 0) >= CFG["storm_wind_kmh"]
    ]
    if storm:
        peak = max(day.get("gust") or 0 for day in storm)
        harvest = x.stage in ("ripening", "harvest")
        danger = peak >= CFG["storm_danger_gust_kmh"] or (region["coastal"] and harvest)
        out.append(
            _draft(
                "storm",
                "storm",
                "danger" if danger else "warning",
                "🌀",
                {"code": "farm.storm.title_coastal" if region["coastal"] else "farm.storm.title"},
                {"code": "farm.storm.body", "params": {"gust": round(peak), "day": storm[0]["date"]}},
                [
                    {"code": "farm.storm.a1_harvest" if harvest else "farm.storm.a1_stake"},
                    {"code": "farm.storm.a2"},
                    {"code": "farm.storm.a3"},
                ],
                storm[0]["date"],
                storm[-1]["date"],
            )
        )

    # 5. Cold wave: the 4 official BMD bands (V0 merged severe and very severe).
    cold = [day for day in d if day.get("tmin") is not None and bmd_cold(day["tmin"])]
    if cold:
        low = min(day["tmin"] for day in cold)
        band = bmd_cold(low) or "mild"
        lvl = {"very_severe": "danger", "severe": "danger", "moderate": "warning", "mild": "watch"}[band]
        out.append(
            _draft(
                "cold",
                "cold",
                lvl,
                "🥶",
                {"code": f"farm.cold.title_{band}"},
                {"code": "farm.cold.body", "params": {"low": round(low, 1), "day": cold[0]["date"]}},
                _a3("cold"),
                cold[0]["date"],
                cold[-1]["date"],
                ["bmd_thresholds"],
            )
        )

    # 6. Potato late blight
    if x.crop in ("potato", "vegetables"):
        t_lo, t_hi = CFG["blight_t"]
        by_day: dict[str, int] = {}
        for h in x.hourly:
            if h["time"][:10] < first:
                continue
            if (h.get("rh") or 0) >= CFG["blight_rh"] and h.get("temp") is not None and t_lo <= h["temp"] <= t_hi:
                by_day[h["time"][:10]] = by_day.get(h["time"][:10], 0) + 1
        days = sorted(k for k, n in by_day.items() if n >= CFG["blight_hours"])
        consecutive = any(
            (date.fromisoformat(days[i]) - date.fromisoformat(days[i - 1])).days == 1 for i in range(1, len(days))
        )
        if consecutive:
            out.append(
                _draft(
                    "late_blight",
                    "disease",
                    "warning",
                    "🍂",
                    {"code": "farm.late_blight.title"},
                    {"code": "farm.late_blight.body", "params": {"days": len(days)}},
                    _a3("late_blight"),
                    days[0],
                    days[-1],
                )
            )

    # 7. Monsoon onset
    lo, hi = CFG["monsoon_months"]
    if lo <= x.month <= hi:
        run, onset = 0, None
        for day in d:
            run = run + 1 if (day.get("rain") or 0) >= CFG["monsoon_wet_mm"] else 0
            if run >= CFG["monsoon_run"] and onset is None:
                onset = day["date"]
        if onset:
            out.append(
                _draft(
                    "monsoon",
                    "rain",
                    "info",
                    "🌧️",
                    {"code": "farm.monsoon.title"},
                    {"code": "farm.monsoon.body", "params": {"day": onset}},
                    _a3("monsoon"),
                    onset,
                    last,
                )
            )

    # 8. Lightning, weighted by LIS/OTD climatology: where lightning is common, a lower CAPE is enough.
    w = max(0.5, min(2.0, x.lightning_weight or 1.0))
    future_h = [h for h in x.hourly if h["time"][:10] >= first][:72]
    stormy = [
        h
        for h in future_h
        if (h.get("cape") or 0) >= CFG["cape"] / w and (h.get("precip_prob") or 0) >= CFG["cape_prob"]
    ]
    thunder = [day for day in d[:3] if day.get("code") in CFG["thunder_codes"]]
    if stormy or thunder:
        danger = any(
            (h.get("cape") or 0) >= CFG["cape_danger"] / w and (h.get("precip_prob") or 0) >= CFG["cape_danger_prob"]
            for h in stormy
        ) or any(day.get("code") == 99 for day in thunder)
        frm = stormy[0]["time"][:10] if stormy else thunder[0]["date"]
        to = thunder[-1]["date"] if thunder else stormy[-1]["time"][:10]
        body = (
            {
                "code": "farm.lightning.body",
                "params": {"cape": round(max(h["cape"] for h in stormy)), "day": frm, "time": stormy[0]["time"][11:16]},
            }
            if stormy
            else {"code": "farm.lightning.body_codes", "params": {"day": frm}}
        )
        out.append(
            _draft(
                "lightning",
                "lightning",
                "danger" if danger else "warning",
                "⚡",
                {"code": "farm.lightning.title"},
                body,
                _a3("lightning"),
                frm,
                to,
                ["lisotd"] if x.lightning_rate is not None else [],
            )
        )

    # 9. Field-worker heat (heat index with the 13:00 humidity)
    hi_days = []
    for day in d:
        rh = next(
            (h.get("rh") for h in x.hourly if h["time"].startswith(day["date"]) and h["time"].endswith("13:00")), None
        )
        hi_c = heat_index(day["tmax"], rh if rh is not None else 60.0)
        if hi_c >= CFG["worker_hi"]:
            hi_days.append((day, hi_c))
    if hi_days:
        peak = max(v for _, v in hi_days)
        out.append(
            _draft(
                "worker_heat",
                "heat",
                "danger" if peak >= CFG["worker_hi_danger"] else "warning",
                "🥵",
                {"code": "farm.worker_heat.title"},
                {"code": "farm.worker_heat.body", "params": {"peak": round(peak), "day": hi_days[0][0]["date"]}},
                _a3("worker_heat"),
                hi_days[0][0]["date"],
                hi_days[-1][0]["date"],
            )
        )

    # 10. Heavy rain (BMD 24 h classes): heavy ≥ 44 mm, very heavy > 88 mm; forecast or the last 72 h (IMERG).
    heavy = [day for day in d if bmd_rain(day.get("rain")) in ("heavy", "very_heavy")]
    observed = x.imerg_max_day_mm is not None and bmd_rain(x.imerg_max_day_mm) in ("heavy", "very_heavy")
    if heavy or observed:
        peak_fc = max((day.get("rain") or 0 for day in heavy), default=0.0)
        peak = max(peak_fc, x.imerg_max_day_mm or 0.0)
        cls = bmd_rain(peak) or "heavy"
        srcs = ["bmd_thresholds"] + (["imerg"] if observed else [])
        if heavy:
            body = {
                "code": "farm.heavy_rain.body",
                "params": {"mm": round(peak_fc), "day": heavy[0]["date"], "class": cls},
            }
            frm, to = heavy[0]["date"], heavy[-1]["date"]
        else:
            body = {
                "code": "farm.heavy_rain.body_observed",
                "params": {"mm": round(x.imerg_max_day_mm or 0), "mm72": round(x.imerg_72h_mm or 0)},
            }
            frm = to = first
        out.append(
            _draft(
                "heavy_rain",
                "rain",
                "danger" if cls == "very_heavy" else "warning",
                "🌧️",
                {"code": f"farm.heavy_rain.title_{cls}"},
                body,
                _a3("heavy_rain"),
                frm,
                to,
                srcs,
            )
        )

    return sorted(out, key=lambda a: LEVEL_ORDER[a["level"]])


_ = BMD  # thresholds live in engines.weather.BMD (config)
