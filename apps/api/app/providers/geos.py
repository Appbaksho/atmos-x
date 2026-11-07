"""NASA GMAO GEOS-FP (forecast) and GEOS-CF v2 (composition) via NCCS OPeNDAP (prompt-v1 §5.2).

Worker only: GEOS-FP is slow (72 steps took 27–53 s; 120 steps once returned 504). Fill 1.0E15.
The newest listed run may not be ready yet, so callers walk back through the listing.
GEOS-CF v1 stopped in Dec 2024; v2 is used (`pm25_rh35`, µg/m³ at 35 % RH).
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

from ..http import fetch

PROVIDER = "nccs"
FP_DIR = "https://opendap.nccs.nasa.gov/dods/GEOS-5/fp/0.25_deg/fcast/tavg1_2d_slv_Nx/"
CF_DIR = "https://opendap.nccs.nasa.gov/dods/gmao/geos-cf/v2/fcst/aqc_tavg_1hr_glo_L1440x721_slv/"
FILL = 1.0e15
# GrADS DODS time axis: days since 0001-01-01 with a 2-day offset to Python's ordinal (verified on
# the 2026-11-06_09z and 2026-11-07_00z runs). Each value is cross-checked against the run name.
GRADS_OFFSET_DAYS = 2


def fp_index(lat: float, lng: float) -> tuple[int, int]:
    return round((lat + 90) / 0.25), round((lng + 180) / 0.3125)


def cf_index(lat: float, lng: float) -> tuple[int, int]:
    return round((lat + 90) / 0.25), round((lng + 180) / 0.25)


def grads_time(t: float) -> datetime:
    """Rounded to the second: the day fraction carries float noise of a few microseconds."""
    return datetime(1, 1, 1, tzinfo=UTC) + timedelta(seconds=round((t - GRADS_OFFSET_DAYS) * 86400))


def parse_ascii(text: str, var: str) -> tuple[list[float | None], list[datetime]]:
    """Parse a GrADS DODS .ascii reply: values in index order (fill → None) and the time axis."""
    head = text.find(f"{var},")
    if head < 0:
        raise ValueError(f"{var} not in reply")
    body = text[head:]
    vals: list[float | None] = []
    for m in re.finditer(r"^\[(\d+)\](?:\[\d+\])*,\s*([-+0-9.eE]+)\s*$", body, re.M):
        v = float(m.group(2))
        vals.append(None if abs(v) >= FILL / 10 else v)
    times: list[datetime] = []
    tm = re.search(r"^time, \[\d+\]\s*\n([^\n]+)", body, re.M)
    if tm:
        times = [grads_time(float(x)) for x in tm.group(1).split(",") if x.strip()]
    return vals, times


async def list_runs(directory: str, pattern: str, timeout: float = 60) -> list[str]:
    r = await fetch(PROVIDER, "GET", directory, timeout=timeout, retries=2)
    return sorted(set(re.findall(pattern, r.text)), reverse=True)


def run_time(run: str) -> datetime:
    """'20261107_06' or '20261106_09z' → UTC datetime."""
    s = run.rstrip("z")
    return datetime.strptime(s, "%Y%m%d_%H").replace(tzinfo=UTC)


async def fp_series(lat: float, lng: float, *, steps: int = 120, timeout: float = 120) -> dict:
    """Hourly t2m (°C) from the newest GEOS-FP run that answers.

    tavg1_2d_slv_Nx has no `t2mdew` (the plan assumed it); only Tmax/Tmin are used from GEOS-FP,
    feels-like comes from Open-Meteo humidity.
    """
    runs = await list_runs(FP_DIR, r"tavg1_2d_slv_Nx\.(\d{8}_\d{2})")
    la, lo = fp_index(lat, lng)
    last_err: Exception | None = None
    for run in runs[:4]:
        url = f"{FP_DIR}tavg1_2d_slv_Nx.{run}.ascii"
        try:
            t = await fetch(PROVIDER, "GET", f"{url}?t2m[0:1:{steps - 1}][{la}][{lo}]", timeout=timeout, retries=1)
            t2m, times = parse_ascii(t.text, "t2m")
        except Exception as e:  # newest run not ready (200 with an error body), or a 504: walk back
            last_err = e
            continue
        start = run_time(run) + timedelta(minutes=30)
        expect = [start + timedelta(hours=i) for i in range(len(t2m))]
        if times and abs((times[0] - expect[0]).total_seconds()) > 3600:
            times = expect  # trust the run name over the decoded axis
        times = times or expect
        return {
            "run": run,
            "hours": [
                {"time": tt.isoformat(), "t_c": None if a is None else round(a - 273.15, 2)}
                for tt, a in zip(times, t2m, strict=False)
            ],
            "grid": {"lat": -90 + la * 0.25, "lng": -180 + lo * 0.3125},
        }
    raise last_err or RuntimeError("no GEOS-FP run answered")


async def cf_pm25(lat: float, lng: float, *, steps: int = 120, timeout: float = 120) -> dict:
    """Hourly PM2.5 (µg/m³ at 35 % RH) from the newest GEOS-CF v2 09z forecast that answers."""
    runs = await list_runs(CF_DIR, r"aqc_tavg_1hr_glo_L1440x721_slv\.(\d{8}_\d{2}z)")
    la, lo = cf_index(lat, lng)
    last_err: Exception | None = None
    for run in runs[:3]:
        url = f"{CF_DIR}aqc_tavg_1hr_glo_L1440x721_slv.{run}.ascii?pm25_rh35[0:1:{steps - 1}][0:0][{la}][{lo}]"
        try:
            r = await fetch(PROVIDER, "GET", url, timeout=timeout, retries=1)
            vals, times = parse_ascii(r.text, "pm25_rh35")
        except Exception as e:
            last_err = e
            continue
        start = run_time(run) + timedelta(minutes=30)
        expect = [start + timedelta(hours=i) for i in range(len(vals))]
        if not times or abs((times[0] - expect[0]).total_seconds()) > 3600:
            times = expect
        return {
            "run": run,
            "hours": [{"time": tt.isoformat(), "pm25": v} for tt, v in zip(times, vals, strict=False)],
            "grid": {"lat": -90 + la * 0.25, "lng": -180 + lo * 0.25},
        }
    raise last_err or RuntimeError("no GEOS-CF run answered")
