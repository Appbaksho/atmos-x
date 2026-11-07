"""`make verify-sources` (prompt-v1 §12 Stage 4): one real request per source.

Prints source, status, latency, latest data date, a sample value with units and pass/fail against an
expected range. Earthdata sources report `skipped: no credential` without a token. Never prints
secrets. `--write PATH` also writes the Markdown table.
"""

from __future__ import annotations

import argparse
import asyncio
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from app.config import settings
from app.engines import raster as R
from app.http import aclose, fetch, get_json
from app.providers import geos, nominatim, open_meteo, openaq, power
from app.providers import planetary as pc
from app.providers.rasterio_io import read_point

LAT, LNG = 23.759, 90.359  # Mohammadpur, Dhaka
BBOX = [90.35, 23.75, 90.37, 23.77]


@dataclass
class Row:
    source: str
    status: str = "fail"
    ms: int = 0
    latest: str = ""
    sample: str = ""
    note: str = ""


def _bearer() -> dict:
    return {"Authorization": f"Bearer {settings.earthdata_token}"} if settings.earthdata_token else {}


def in_range(v: float, lo: float, hi: float) -> bool:
    return lo <= v <= hi


async def check_landsat(r: Row):
    today = datetime.now(UTC).date()
    items = await pc.search(
        ["landsat-c2-l2"],
        BBOX,
        f"{today - timedelta(days=90)}/{today}",
        query={"platform": {"in": ["landsat-8", "landsat-9"]}, "eo:cloud_cover": {"lt": 40}},
        max_items=10,
    )
    r.latest = pc.item_date(items[0]) if items else ""
    for it in items:
        dn = await read_point(await pc.sign(it["assets"]["lwir11"]["href"]), LAT, LNG)
        qa = await read_point(await pc.sign(it["assets"]["qa_pixel"]["href"]), LAT, LNG)
        if dn and R.landsat_clear(__import__("numpy").array([qa]))[0]:
            c = float(R.landsat_st_to_c(__import__("numpy").array([dn]))[0])
            r.sample = f"{c:.1f} °C surface ({pc.item_date(it)})"
            return in_range(c, 0, 70)
    r.note = "no clear pixel in recent scenes"
    return bool(items)


async def check_hls(r: Row):
    today = datetime.now(UTC).date()
    items = await pc.search(["hls2-l30", "hls2-s30"], BBOX, f"{today - timedelta(days=60)}/{today}", max_items=20)
    r.latest = max((pc.item_date(i) for i in items), default="")
    r.sample = f"{len(items)} granules in 60 days"
    return len(items) > 0


async def check_modis(r: Row):
    today = datetime.now(UTC).date()
    items = await pc.search(["modis-11A2-061"], BBOX, f"{today - timedelta(days=60)}/{today}", max_items=10)
    r.latest = pc.item_date(items[0]) if items else ""
    for it in items:
        v = await read_point(await pc.sign(it["assets"]["LST_Night_1km"]["href"]), LAT, LNG)
        if v:
            c = v * R.MODIS_LST_SCALE - R.K_TO_C
            r.sample = f"{c:.1f} °C night surface"
            return in_range(c, -10, 45)
    r.note = "all recent composites are fill at this pixel"
    return bool(items)


async def check_worldcover(r: Row):
    items = await pc.search(
        ["esa-worldcover"],
        BBOX,
        "2021-01-01/2021-12-31",
        query={"esa_worldcover:product_version": {"eq": "2.0.0"}},
        max_items=2,
    )
    v = await read_point(await pc.sign(items[0]["assets"]["map"]["href"]), LAT, LNG)
    r.latest = "2021 (v200)"
    r.sample = f"class {v} at Mohammadpur"
    return v in (10, 20, 30, 40, 50, 60, 80, 90)


async def check_power(r: Row):
    today = datetime.now(UTC).date()
    d = await power.daily(LAT, LNG, today - timedelta(days=14), today, ["T2M_MAX"], timeout=60)
    vals = d["values"]["T2M_MAX"]
    k = max(vals) if vals else None
    r.latest = f"{k[:4]}-{k[4:6]}-{k[6:]}" if k else ""
    r.sample = f"T2M_MAX {vals[k]:.1f} {d['units']['T2M_MAX']}" if k else ""
    return k is not None and in_range(vals[k], 5, 48)


async def check_geos_fp(r: Row):
    runs = await geos.list_runs(geos.FP_DIR, r"tavg1_2d_slv_Nx\.(\d{8}_\d{2})")
    la, lo = geos.fp_index(LAT, LNG)
    for run in runs[:4]:
        try:
            resp = await fetch(
                "nccs", "GET", f"{geos.FP_DIR}tavg1_2d_slv_Nx.{run}.ascii?t2m[0:1:2][{la}][{lo}]", timeout=120
            )
            vals, _ = geos.parse_ascii(resp.text, "t2m")
        except Exception:
            continue
        c = vals[0] - 273.15
        r.latest = f"run {run}"
        r.sample = f"t2m {c:.1f} °C"
        return in_range(c, 0, 48)
    return False


async def check_geos_cf(r: Row):
    runs = await geos.list_runs(geos.CF_DIR, r"aqc_tavg_1hr_glo_L1440x721_slv\.(\d{8}_\d{2}z)")
    la, lo = geos.cf_index(LAT, LNG)
    for run in runs[:3]:
        try:
            resp = await fetch(
                "nccs",
                "GET",
                f"{geos.CF_DIR}aqc_tavg_1hr_glo_L1440x721_slv.{run}.ascii?pm25_rh35[0:1:2][0:0][{la}][{lo}]",
                timeout=120,
            )
            vals, _ = geos.parse_ascii(resp.text, "pm25_rh35")
        except Exception:
            continue
        r.latest = f"run {run}"
        r.sample = f"PM2.5 {vals[0]:.1f} µg/m³"
        return in_range(vals[0], 0, 1000)
    return False


async def _cmr_latest(concept: str) -> dict:
    j = await get_json(
        "cmr",
        "https://cmr.earthdata.nasa.gov/search/granules.json",
        params={"concept_id": concept, "sort_key": "-start_date", "page_size": 1},
        timeout=30,
    )
    return j["feed"]["entry"][0]


async def check_ecostress(r: Row):
    j = (
        await fetch(
            "cmr",
            "POST",
            "https://cmr.earthdata.nasa.gov/stac/LPCLOUD/search",
            json={
                "collections": ["ECO_L2T_LSTE_002"],
                "bbox": [90.33, 23.69, 90.5, 23.9],
                "datetime": f"{(datetime.now(UTC) - timedelta(days=60)).date()}T00:00:00Z/{datetime.now(UTC).date()}T23:59:59Z",
                "limit": 100,
            },
            timeout=60,
        )
    ).json()
    feats = j.get("features", [])
    r.latest = max((f["properties"]["datetime"][:10] for f in feats), default="")
    if not feats:
        return False
    href = next(v["href"] for k, v in feats[0]["assets"].items() if k.endswith("_LST") and not k.startswith("s3_"))
    head = await fetch("lpdaac", "HEAD", href, headers=_bearer(), timeout=60, ok_statuses=(200, 401, 403))
    r.sample = f"{len(feats)} passes in 60 days; asset HTTP {head.status_code}"
    return head.status_code == 200


async def check_imerg(r: Row):
    g = await _cmr_latest("C2723754850-GES_DISC")
    r.latest = g["time_start"][:10]
    href = next(ln["href"] for ln in g["links"] if ln["href"].endswith(".nc4") and "data.gesdisc" in ln["href"])
    head = await fetch("gesdisc", "HEAD", href, headers=_bearer(), timeout=60, ok_statuses=(200, 401, 403))
    r.sample = f"daily file HTTP {head.status_code}, {int(head.headers.get('content-length', 0)) // 1_000_000} MB"
    return head.status_code == 200


async def check_smap(r: Row):
    g = await _cmr_latest("C3480440870-NSIDC_CPRD")
    r.latest = g["time_start"][:16]
    href = next(
        (ln["href"] for ln in g["links"] if ln["href"].endswith(".h5") and ln["href"].startswith("https")), None
    )
    if not href:
        r.note = "no HTTPS link in CMR"
        return False
    head = await fetch("nsidc", "HEAD", href, headers=_bearer(), timeout=60, ok_statuses=(200, 401, 403))
    r.sample = f"granule HTTP {head.status_code}"
    return head.status_code == 200


async def check_lisotd(r: Row):
    url = "https://data.ghrc.earthdata.nasa.gov/ghrcw-protected/lohrmc__2.3.2015/LISOTD_HRMC_V2.3.2015.nc"
    head = await fetch("ghrc", "HEAD", url, headers=_bearer(), timeout=60, ok_statuses=(200, 401, 403))
    r.latest = "climatology 1995–2014"
    r.sample = f"file HTTP {head.status_code}"
    return head.status_code == 200


async def check_cmip6(r: Row):
    from app.providers import cmip6

    vals = await cmip6.tasmax("ACCESS-CM2", "ssp245", 2040, LAT, LNG, [4])
    r.latest = "ssp245 2040"
    r.sample = f"tasmax April 2040 mean {sum(vals) / len(vals):.1f} °C ({len(vals)} days)" if vals else ""
    return bool(vals) and in_range(sum(vals) / len(vals), 20, 48)


async def check_ornl(r: Row):
    j = await get_json(
        "ornl",
        "https://modis.ornl.gov/rst/api/v1/MOD11A2/dates",
        params={"latitude": LAT, "longitude": LNG},
        headers={"Accept": "application/json"},
        timeout=60,
    )
    dates = j.get("dates", [])
    r.latest = dates[-1]["calendar_date"] if dates else ""
    r.sample = f"{len(dates)} composites listed"
    return bool(dates)


async def check_gibs(r: Row):
    from app.services.gibs import CAPS, parse_default_date

    resp = await fetch("gibs", "GET", CAPS, timeout=120)
    d = parse_default_date(resp.text)
    r.latest = d or ""
    tile = await fetch(
        "gibs",
        "GET",
        f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Land_Surface_Temp_Day/default/{d}/GoogleMapsCompatible_Level7/6/27/48.png",
        timeout=60,
        ok_statuses=(200, 404),
    )
    r.sample = f"tile z6 HTTP {tile.status_code}"
    return d is not None


async def check_gpw(r: Row):
    j = await get_json(
        "cmr",
        "https://cmr.earthdata.nasa.gov/search/collections.json",
        params={"short_name": "CIESIN_SEDAC_GPWv4_POPDENS_R11"},
        timeout=30,
    )
    n = len(j["feed"]["entry"])
    r.latest = "2020 grid"
    r.sample = f"{n} collection(s) in CMR"
    r.note = "GeoTIFF needs `make static-data`; not sampled live"
    return n > 0


async def check_open_meteo(r: Row):
    fc = await open_meteo.forecast(LAT, LNG, timeout=20)
    r.latest = fc["current"]["time"]
    r.sample = f"{fc['current']['temp']} °C air"
    return in_range(fc["current"]["temp"], -10, 50)


async def check_openaq(r: Row):
    if not settings.openaq_api_key:
        r.status = "skipped"
        r.note = "no OPENAQ_API_KEY"
        return None
    locs = await openaq.locations(LAT, LNG)
    if not locs:
        return False
    from app.engines.heat import haversine_m

    d = min(haversine_m(LAT, LNG, s["lat"], s["lng"]) for s in locs)
    r.sample = f"{len(locs)} PM2.5 locations; nearest {d / 1000:.1f} km"
    r.note = (
        "coordinates order lat,lng confirmed (stations are near Dhaka)"
        if d < 25_000
        else "stations far away: check coordinate order"
    )
    latest = await openaq.latest(locs[0]["id"])
    r.latest = max((x["datetime"] or "" for x in latest), default="")[:16]
    return d < 25_000


async def check_nominatim(r: Row):
    j = await nominatim.reverse(LAT, LNG, "en", timeout=20)
    r.sample = j["place"]
    r.latest = "live"
    return "Dhaka" in (j["place"] or "")


async def check_overpass(r: Row):
    ok = []
    for url in settings.overpass_list:
        try:
            resp = await fetch(
                "overpass",
                "POST",
                url,
                data={"data": "[out:json][timeout:20];node(23.758,90.358,23.760,90.360);out count;"},
                timeout=40,
            )
            ok.append(resp.status_code == 200)
        except Exception:
            ok.append(False)
    r.sample = f"{sum(ok)}/{len(ok)} mirrors answered"
    r.latest = "live"
    return any(ok)


async def check_dbip(r: Row):
    from app.services.geo import _dbip_path

    p = _dbip_path()
    r.latest = p.name if p else ""
    r.sample = "local file present" if p else "not downloaded (make static-data)"
    return p is not None


CHECKS: list[tuple[str, Callable[[Row], Awaitable[bool | None]], str | None]] = [
    ("Landsat 8/9 C2 L2 (Planetary Computer)", check_landsat, None),
    ("HLS v2.0", check_hls, None),
    ("MODIS LST 11A2", check_modis, None),
    ("ESA WorldCover v200", check_worldcover, None),
    ("ECOSTRESS ECO_L2T_LSTE.002", check_ecostress, "earthdata"),
    ("NASA POWER daily", check_power, None),
    ("GEOS-FP (NCCS)", check_geos_fp, None),
    ("GEOS-CF v2 (NCCS)", check_geos_cf, None),
    ("GPM IMERG Early V07", check_imerg, "earthdata"),
    ("SMAP L4 SPL4SMGP v008", check_smap, "earthdata"),
    ("LIS/OTD HRMC v2.3", check_lisotd, "earthdata"),
    ("NEX-GDDP-CMIP6 (NCCS THREDDS)", check_cmip6, None),
    ("ORNL MODIS web service", check_ornl, None),
    ("NASA GIBS", check_gibs, None),
    ("GPWv4.11 (SEDAC)", check_gpw, None),
    ("Open-Meteo forecast", check_open_meteo, None),
    ("OpenAQ v3", check_openaq, None),
    ("Nominatim", check_nominatim, None),
    ("Overpass mirrors", check_overpass, None),
    ("DB-IP City Lite (local)", check_dbip, None),
]


async def run_all() -> list[Row]:
    rows = []
    for name, fn, needs in CHECKS:
        r = Row(name)
        if needs == "earthdata" and not settings.earthdata_enabled:
            r.status = "skipped"
            r.note = "skipped: no credential"
            rows.append(r)
            continue
        t0 = time.perf_counter()
        try:
            ok = await asyncio.wait_for(fn(r), timeout=240)
            if r.status != "skipped":
                r.status = "pass" if ok else "fail"
        except Exception as e:
            r.status = "fail"
            r.note = (r.note + " " if r.note else "") + re.sub(r"\s+", " ", f"{type(e).__name__}: {e}")[:160]
        r.ms = round((time.perf_counter() - t0) * 1000)
        rows.append(r)
        print(f"{r.status:7} {r.ms:6} ms  {name:38} {r.latest:20} {r.sample}  {r.note}", flush=True)
    await aclose()
    return rows


def markdown(rows: list[Row]) -> str:
    head = f"# Source check\n\nRun {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')} by `make verify-sources` from the build machine (Mohammadpur, Dhaka).\n\n"
    head += "| Source | Status | Latency | Latest data | Sample | Note |\n| --- | --- | --- | --- | --- | --- |\n"
    for r in rows:
        head += f"| {r.source} | {r.status} | {r.ms} ms | {r.latest} | {r.sample} | {r.note} |\n"
    passed = sum(1 for r in rows if r.status == "pass")
    head += f"\n{passed} of {len(rows)} passed.\n"
    return head


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", default=None)
    args = ap.parse_args()
    rows = asyncio.run(run_all())
    if args.write:
        Path(args.write).write_text(markdown(rows))
        print(f"wrote {args.write}")


if __name__ == "__main__":
    _ = date
    main()
