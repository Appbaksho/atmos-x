"""Heat pipeline (prompt-v1 §7.1). Worker only: reads NASA/USGS/ESA rasters, writes `heat_cells`.

For an area (a set of H3 res-10 cells):
  1. Landsat 8/9 C2 L2 scenes from the last 120 days; QA-masked lwir11 → °C; per-pixel median.
  2. A hex is 'satellite' with ≥ 8 valid 30 m pixels and ≥ 2 clear observations; otherwise the
     window widens to 365 days, then MODIS 1 km, then a land-cover estimate (labelled estimate).
  3. WorldCover shares, HLS NDVI (Landsat SR fallback), Liang albedo over built pixels, MODIS night.
  4. ECOSTRESS sharpening of the relative day pattern when an Earthdata token exists.
  5. Baseline = median hex LST; Heat Score per hex (engines.heat), independent of any scan.
"""

from __future__ import annotations

import asyncio
import logging
import math
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

import h3
import numpy as np
from rasterio.enums import Resampling
from shapely.geometry import box, shape
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import PIPELINE_VERSION
from ..engines import heat as H
from ..engines import raster as R
from ..http import UpstreamError
from ..models import Composite, HeatCell
from ..providers import planetary as pc
from ..providers.rasterio_io import Grid, cells_bbox, grid_for_bbox, pixel_codes, read_to_grid

log = logging.getLogger("atmos.heat")

Progress = Callable[[int, int], Awaitable[None]]

MAX_SCENES = 8
MIN_CLEAR_SHARE = 0.20
ALBEDO_SCENES = 2
NDVI_ITEMS = 4
MODIS_ITEMS = 6


@dataclass
class AreaResult:
    composite: Composite
    cells: int
    satellite: int
    estimate: int
    no_data: int
    timings: dict[str, float] = field(default_factory=dict)


def _coverage(item: dict, bbox: tuple[float, float, float, float]) -> float:
    try:
        geom = shape(item["geometry"])
    except Exception:
        return 0.0
    b = box(*bbox)
    return geom.intersection(b).area / b.area if b.area else 0.0


def _isodate(item: dict) -> date:
    return date.fromisoformat(pc.item_date(item))


async def _landsat_pass(
    grid: Grid, codes: np.ndarray, bbox, n_cells: int, start: date, end: date, exclude: set[str]
) -> tuple[list[np.ndarray], list[dict], list[np.ndarray]]:
    """Accepted scenes in [start, end]: LST arrays (°C, NaN masked), item metadata, clear masks."""
    items = await pc.search(
        ["landsat-c2-l2"],
        list(bbox),
        f"{start.isoformat()}/{end.isoformat()}",
        query={"platform": {"in": ["landsat-8", "landsat-9"]}, "eo:cloud_cover": {"lt": 60}},
        max_items=60,
    )
    items = [i for i in items if i["id"] not in exclude and _coverage(i, bbox) >= 0.5]
    items.sort(key=lambda i: (pc.item_date(i), _coverage(i, bbox)), reverse=True)
    inside = codes >= 0
    # One scene per pass date (overlapping WRS rows): keep the better-covering one.
    cands: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for it in items:
        key = (pc.item_date(it), it["properties"].get("platform", ""))
        if key in seen:
            continue
        seen.add(key)
        cands.append(it)
        if len(cands) >= MAX_SCENES + 2:
            break

    async def qa_of(it: dict) -> np.ndarray | None:
        try:
            return await read_to_grid(await pc.sign(it["assets"]["qa_pixel"]["href"]), grid, src_nodata=1)
        except Exception as e:  # one bad asset never sinks the job
            log.warning("landsat qa read failed", extra={"data": {"item": it["id"], "err": str(e)[:200]}})
            return None

    qas = await asyncio.gather(*[qa_of(it) for it in cands])
    accepted: list[tuple[dict, np.ndarray, float]] = []
    for it, qa in zip(cands, qas, strict=True):
        if qa is None:
            continue
        clear = R.landsat_clear(qa) & (qa != 0)
        share = float(clear[inside].mean()) if inside.any() else 0.0
        if share >= MIN_CLEAR_SHARE:
            accepted.append((it, clear, share))
        if len(accepted) >= MAX_SCENES:
            break

    async def lst_of(it: dict) -> np.ndarray | None:
        try:
            return await read_to_grid(await pc.sign(it["assets"]["lwir11"]["href"]), grid, src_nodata=0)
        except Exception as e:
            log.warning("landsat lwir read failed", extra={"data": {"item": it["id"], "err": str(e)[:200]}})
            return None

    dns = await asyncio.gather(*[lst_of(it) for it, _, _ in accepted])
    lsts: list[np.ndarray] = []
    meta: list[dict] = []
    clears: list[np.ndarray] = []
    for (it, clear, share), dn in zip(accepted, dns, strict=True):
        if dn is None:
            continue
        lst = R.landsat_st_to_c(dn)
        lst[~clear] = np.nan
        # Physically implausible surface temperatures are treated as missing (§4 rule 4).
        lst[(lst < -40) | (lst > 80)] = np.nan
        lsts.append(lst)
        clears.append(clear)
        meta.append(
            {
                "id": it["id"],
                "date": pc.item_date(it),
                "platform": it["properties"].get("platform"),
                "cloud": it["properties"].get("eo:cloud_cover"),
                "clear_share": round(share, 3),
                "assets": {
                    k: it["assets"][k]["href"]
                    for k in ("blue", "red", "nir08", "swir16", "swir22")
                    if k in it["assets"]
                },
            }
        )
    return lsts, meta, clears


async def _albedo(
    grid: Grid, scenes: list[dict], clears: list[np.ndarray]
) -> tuple[np.ndarray | None, np.ndarray | None, np.ndarray | None]:
    """Median Liang albedo plus Landsat SR red/NIR (NDVI fallback) from the clearest scenes."""
    order = sorted(range(len(scenes)), key=lambda i: -scenes[i]["clear_share"])[:ALBEDO_SCENES]
    albs, reds, nirs = [], [], []
    for i in order:
        a = scenes[i]["assets"]
        if not all(k in a for k in ("blue", "red", "nir08", "swir16", "swir22")):
            continue
        try:
            bands = await asyncio.gather(
                *[
                    read_to_grid(await pc.sign(a[k]), grid, src_nodata=0)
                    for k in ("blue", "red", "nir08", "swir16", "swir22")
                ]
            )
        except Exception as e:
            log.warning("landsat sr read failed", extra={"data": {"err": str(e)[:200]}})
            continue
        b, r, n, s1, s2 = (R.landsat_sr(x) for x in bands)
        alb = R.albedo_liang(b, r, n, s1, s2)
        alb[~clears[i]] = np.nan
        r[~clears[i]] = np.nan
        n[~clears[i]] = np.nan
        albs.append(alb)
        reds.append(r)
        nirs.append(n)
    if not albs:
        return None, None, None
    alb_med, _ = R.nan_median_stack(albs)
    ndvi_sr = R.nan_median_stack([R.ndvi(r, n) for r, n in zip(reds, nirs, strict=True)])[0]
    return alb_med, ndvi_sr, None


async def _worldcover(grid10: Grid, bbox) -> tuple[np.ndarray | None, int | None]:
    items = await pc.search(
        ["esa-worldcover"],
        list(bbox),
        "2021-01-01/2021-12-31",
        query={"esa_worldcover:product_version": {"eq": "2.0.0"}},
        max_items=8,
    )
    if not items:
        return None, None
    out: np.ndarray | None = None
    for it in items:
        arr = await read_to_grid(await pc.sign(it["assets"]["map"]["href"]), grid10, src_nodata=0)
        out = arr if out is None else np.where(out > 0, out, arr)
    return out, 2021


async def _hls_ndvi(grid: Grid, bbox, start: date, end: date) -> tuple[np.ndarray | None, str | None]:
    items = await pc.search(
        ["hls2-l30", "hls2-s30"], list(bbox), f"{start}/{end}", query={"eo:cloud_cover": {"lt": 40}}, max_items=40
    )
    items = [i for i in items if _coverage(i, bbox) >= 0.5]
    items.sort(key=lambda i: (pc.item_date(i), -float(i["properties"].get("eo:cloud_cover", 100))), reverse=True)

    async def one(it: dict) -> tuple[np.ndarray, str] | None:
        nir_key = "B05" if it["collection"] == "hls2-l30" else "B8A"
        a = it["assets"]
        if not all(k in a for k in ("B04", nir_key, "Fmask")):
            return None
        try:
            fm = await read_to_grid(await pc.sign(a["Fmask"]["href"]), grid, src_nodata=255)
            clear = R.hls_clear(fm)
            if clear.mean() < MIN_CLEAR_SHARE:
                return None
            red, nir = await asyncio.gather(
                read_to_grid(await pc.sign(a["B04"]["href"]), grid, src_nodata=-9999),
                read_to_grid(await pc.sign(a[nir_key]["href"]), grid, src_nodata=-9999),
            )
        except Exception as e:
            log.warning("hls read failed", extra={"data": {"item": it["id"], "err": str(e)[:200]}})
            return None
        v = R.ndvi(R.hls_reflectance(red), R.hls_reflectance(nir))
        v[~clear] = np.nan
        return v, pc.item_date(it)

    got = [g for g in await asyncio.gather(*[one(it) for it in items[: NDVI_ITEMS + 2]]) if g is not None][:NDVI_ITEMS]
    arrs = [g[0] for g in got]
    latest = max((g[1] for g in got), default=None)
    if not arrs:
        return None, None
    return R.nan_median_stack(arrs)[0], latest


async def _modis(
    grid: Grid, bbox, start: date, end: date, asset: str
) -> tuple[np.ndarray | None, str | None, str | None]:
    items = await pc.search(["modis-11A2-061"], list(bbox), f"{start}/{end}", max_items=40)
    items = [i for i in items if asset in i.get("assets", {})]

    async def one(it: dict) -> tuple[np.ndarray, str] | None:
        try:
            dn = await read_to_grid(await pc.sign(it["assets"][asset]["href"]), grid, src_nodata=0)
        except Exception as e:
            log.warning("modis read failed", extra={"data": {"item": it["id"], "err": str(e)[:200]}})
            return None
        v = R.modis_lst_to_c(dn)
        return (v, pc.item_date(it)) if np.isfinite(v).any() else None

    got = [g for g in await asyncio.gather(*[one(it) for it in items[:MODIS_ITEMS]]) if g is not None]
    arrs = [g[0] for g in got]
    dates = [g[1] for g in got]
    if not arrs:
        return None, None, None
    return R.nan_median_stack(arrs)[0], min(dates), max(dates)


def _f(v) -> float | None:
    return None if v is None or not np.isfinite(v) else float(v)


async def compute_area(
    db: AsyncSession,
    *,
    area_kind: str,
    area_key: str,
    cells: list[str],
    tmax_c: float | None = None,
    today: date | None = None,
    progress: Progress | None = None,
    ecostress: Callable[
        [Grid, np.ndarray, int, date, date], Awaitable[tuple[np.ndarray | None, np.ndarray | None, int]]
    ]
    | None = None,
) -> AreaResult:
    today = today or datetime.now(UTC).date()
    n = len(cells)
    t0 = datetime.now(UTC)
    timings: dict[str, float] = {}

    def tick(name: str, since: datetime) -> datetime:
        now = datetime.now(UTC)
        timings[name] = round((now - since).total_seconds(), 1)
        return now

    async def prog(step: int, total: int = 8) -> None:
        if progress:
            await progress(round(n * step / total), n)

    bbox = cells_bbox(cells)
    grid = grid_for_bbox(bbox, 30.0)
    grid10 = grid.scaled(3)
    codes = await asyncio.to_thread(pixel_codes, grid, cells)
    t = tick("grid", t0)
    await prog(1)

    # 1–2. Landsat 120 days (widened to 365 for weak hexes); land cover, NDVI and night run alongside.
    start120 = today - timedelta(days=120)

    async def safe(coro, default):
        try:
            return await coro
        except UpstreamError as e:
            log.warning("source unavailable", extra={"data": {"err": str(e)}})
            return default

    (lsts, scenes, clears), (wc, wc_year), (hls, ndvi_date), (mn, night_from, night_to) = await asyncio.gather(
        _landsat_pass(grid, codes, bbox, n, start120, today, set()),
        safe(_worldcover(grid10, bbox), (None, None)),
        safe(_hls_ndvi(grid, bbox, start120, today), (None, None)),
        safe(_modis(grid, bbox, start120, today, "LST_Night_1km"), (None, None, None)),
    )
    window_days = 120
    lst_med = n_obs = None
    hex_lst = np.full(n, np.nan)
    hex_valid = np.zeros(n, dtype=np.int64)
    hex_obs = np.zeros(n)
    if lsts:
        lst_med, n_obs = R.nan_median_stack(lsts)
        hex_lst, hex_valid = R.aggregate_by_cell(codes, lst_med, n)
        hex_obs = R.median_by_cell(codes, np.where(np.isfinite(lst_med), n_obs, np.nan), n)
    weak = (hex_valid < H.HEAT["min_valid_px"]) | ~(np.nan_to_num(hex_obs) >= H.HEAT["min_obs"])
    if weak.any():
        lsts2, scenes2, clears2 = await _landsat_pass(
            grid, codes, bbox, n, today - timedelta(days=365), start120 - timedelta(days=1), {s["id"] for s in scenes}
        )
        if lsts2:
            all_lsts = lsts + lsts2
            med2, obs2 = R.nan_median_stack(all_lsts)
            l2, v2 = R.aggregate_by_cell(codes, med2, n)
            o2 = R.median_by_cell(codes, np.where(np.isfinite(med2), obs2, np.nan), n)
            ok2 = weak & (v2 >= H.HEAT["min_valid_px"]) & (np.nan_to_num(o2) >= H.HEAT["min_obs"])
            hex_lst = np.where(ok2, l2, hex_lst)
            hex_valid = np.where(ok2, v2, hex_valid)
            hex_obs = np.where(ok2, o2, hex_obs)
            if ok2.any():
                window_days = 365
                scenes = scenes + scenes2
                clears = clears + clears2
                lst_med = lst_med if lst_med is not None else med2
    sat = (hex_valid >= H.HEAT["min_valid_px"]) & (np.nan_to_num(hex_obs) >= H.HEAT["min_obs"]) & np.isfinite(hex_lst)
    t = tick("landsat", t)
    await prog(3)

    # 3a. Land cover (WorldCover 10 m → per-30 m fractions → per hex).
    sealed = green = water = tree = np.full(n, np.nan)
    built30 = None
    if wc is not None:
        built30 = R.class_fractions_30m(wc, (R.WC_BUILT,))
        sealed = R.aggregate_by_cell(codes, built30, n)[0]
        green = R.aggregate_by_cell(codes, R.class_fractions_30m(wc, R.WC_GREEN), n)[0]
        water = R.aggregate_by_cell(codes, R.class_fractions_30m(wc, (R.WC_WATER,)), n)[0]
        tree = R.aggregate_by_cell(codes, R.class_fractions_30m(wc, (R.WC_TREE,)), n)[0]
    t = tick("worldcover", t)
    await prog(4)

    # 3b. Albedo (dark surfaces) and the Landsat SR NDVI fallback.
    dark = np.full(n, np.nan)
    ndvi_sr = None
    if scenes:
        alb, ndvi_sr, _ = await _albedo(grid, scenes, clears)
        if alb is not None and built30 is not None:
            built_px = built30 >= 0.5
            darkpx = np.where(built_px & np.isfinite(alb), (alb < R.DARK_ALBEDO).astype(np.float32), np.nan)
            dark = R.aggregate_by_cell(codes, darkpx, n)[0]
    t = tick("albedo", t)
    await prog(5)

    # 3c. NDVI: HLS → Landsat SR → null.
    ndvi_hex = np.full(n, np.nan)
    if hls is not None:
        ndvi_hex = R.aggregate_by_cell(codes, hls, n)[0]
    elif ndvi_sr is not None:
        ndvi_hex = R.aggregate_by_cell(codes, ndvi_sr, n)[0]
        ndvi_date = max(s["date"] for s in scenes)
    t = tick("ndvi", t)
    await prog(6)

    # 3d. Night heat (ECOSTRESS night → MODIS LST_Night_1km) and MODIS day fallback.
    night_hex = np.full(n, np.nan)
    night_src = None
    eco_anom = np.full(n, np.nan)
    eco_passes = 0
    if ecostress is not None:
        try:
            eco_day, eco_night, eco_passes = await ecostress(grid, codes, n, start120, today)
            if eco_day is not None:
                eco_anom = eco_day
            if eco_night is not None and np.isfinite(eco_night).any():
                night_hex = eco_night
                night_src = "ecostress"
        except Exception as e:
            log.warning("ecostress failed", extra={"data": {"err": str(e)[:200]}})
    if night_src is None and mn is not None:
        night_hex = R.aggregate_by_cell(codes, mn, n)[0]
        night_src = "modis"
    elif night_src is not None:
        night_from = night_to = None
    method = "landsat" if sat.any() else "landcover"
    modis_day = np.full(n, np.nan)
    if not sat.all():
        try:
            md, _, _ = await _modis(grid, bbox, start120, today, "LST_Day_1km")
            if md is not None:
                modis_day = R.aggregate_by_cell(codes, md, n)[0]
                if not sat.any() and np.isfinite(modis_day).any():
                    method = "modis"
        except UpstreamError:
            pass
    t = tick("modis", t)
    await prog(7)

    # 4–5. Anomalies, sharpening, scores.
    baseline = float(np.nanmedian(hex_lst[sat])) if sat.any() else None
    landsat_anom = np.where(sat, hex_lst - baseline, np.nan) if baseline is not None else np.full(n, np.nan)
    modis_ok = ~sat & np.isfinite(modis_day)
    modis_base = float(np.nanmedian(modis_day[np.isfinite(modis_day)])) if np.isfinite(modis_day).any() else None
    modis_anom = np.where(modis_ok, modis_day - modis_base, np.nan) if modis_base is not None else np.full(n, np.nan)
    anom_day = np.where(sat, landsat_anom, modis_anom)
    blend = sat & np.isfinite(eco_anom)
    anom_day = np.where(blend, H.HEAT["blend_landsat"] * landsat_anom + H.HEAT["blend_ecostress"] * eco_anom, anom_day)
    night_med = float(np.nanmedian(night_hex)) if np.isfinite(night_hex).any() else None
    anom_night = night_hex - night_med if night_med is not None else np.full(n, np.nan)

    has_cover = np.isfinite(sealed) & np.isfinite(green)
    est_ok = ~sat & ~modis_ok & has_cover
    est_lst = np.full(n, np.nan)
    if est_ok.any():
        ref = tmax_c if tmax_c is not None else (baseline if baseline is not None else None)
        if ref is not None:
            est_lst = np.array(
                [H.est_lst_c(ref, s, g, np.nan_to_num(w)) for s, g, w in zip(sealed, green, water, strict=True)]
            )
            est_med = float(np.nanmedian(est_lst[est_ok]))
            anom_day = np.where(est_ok, est_lst - est_med, anom_day)
        else:
            est_ok[:] = False

    now = datetime.now(UTC)
    lst_dates = sorted(s["date"] for s in scenes)
    comp = Composite(
        area_kind=area_kind,
        area_key=area_key,
        pipeline_version=PIPELINE_VERSION,
        method=method,
        lst_from=date.fromisoformat(lst_dates[0]) if lst_dates else None,
        lst_to=date.fromisoformat(lst_dates[-1]) if lst_dates else None,
        lst_scenes=[{k: v for k, v in s.items() if k != "assets"} for s in scenes],
        window_days=window_days,
        ndvi_date=date.fromisoformat(ndvi_date) if ndvi_date else None,
        worldcover_year=wc_year,
        ecostress_passes=eco_passes,
        night_source=night_src,
        night_from=date.fromisoformat(night_from) if night_from else None,
        night_to=date.fromisoformat(night_to) if night_to else None,
        baseline_lst_c=round(baseline, 2) if baseline is not None else None,
        cell_count=n,
        satellite_cells=int(sat.sum()),
        stats={"timings": timings, "modis_cells": int(modis_ok.sum()), "estimate_cells": int(est_ok.sum())},
    )
    db.add(comp)
    await db.flush()

    rows = []
    counts = {"satellite": 0, "estimate": 0, "no_data": 0}
    for i, cell in enumerate(cells):
        lat, lng = h3.cell_to_latlng(cell)
        if sat[i] or modis_ok[i]:
            label = "satellite"
            lst = hex_lst[i] if sat[i] else modis_day[i]
            src = "landsat" if sat[i] else "modis"
        elif est_ok[i]:
            label, lst, src = "estimate", est_lst[i], "landcover"
        else:
            label, lst, src = "no_data", np.nan, None
        res = None
        if label != "no_data":
            res = H.heat_score(_f(anom_day[i]), _f(anom_night[i]), _f(sealed[i]), _f(green[i]), None)
        if res is None:
            label = "no_data"
        counts[label] += 1
        rows.append(
            {
                "h3": cell,
                "chunk": h3.cell_to_parent(cell, H.CHUNK_RES),
                "composite_id": comp.id,
                "lat": lat,
                "lng": lng,
                "label": label,
                "score": res.score if res else None,
                "lst_c": round(float(lst), 2) if label != "no_data" and np.isfinite(lst) else None,
                "anom_day": _r(anom_day[i]),
                "landsat_anom": _r(landsat_anom[i]),
                "eco_anom": _r(eco_anom[i]),
                "night_lst_c": _r(night_hex[i]),
                "anom_night": _r(anom_night[i]),
                "sealed": _r(sealed[i], 3),
                "green": _r(green[i], 3),
                "water": _r(water[i], 3),
                "tree": _r(tree[i], 3),
                "ndvi": _r(ndvi_hex[i], 3),
                "dark_surface": _r(dark[i], 3),
                "pop_density_km2": None,
                "valid_px": int(hex_valid[i]),
                "n_obs": int(np.nan_to_num(hex_obs[i])),
                "terms": (res.terms if res else []) + ([f"lst:{src}"] if src else []),
                "updated_at": now,
            }
        )
    await _upsert(db, rows)
    comp.satellite_cells = counts["satellite"]
    timings["total"] = round((datetime.now(UTC) - t0).total_seconds(), 1)
    comp.stats = {**comp.stats, "timings": timings, "counts": counts}
    await db.commit()
    await prog(8)
    log.info(
        "heat area done",
        extra={
            "data": {
                "area": area_key,
                "cells": n,
                **counts,
                "method": method,
                "scenes": len(scenes),
                "s": timings["total"],
            }
        },
    )
    return AreaResult(comp, n, counts["satellite"], counts["estimate"], counts["no_data"], timings)


def _r(v, nd: int = 2) -> float | None:
    if v is None:
        return None
    fv = float(v)
    return round(fv, nd) if math.isfinite(fv) else None


UPDATABLE = [
    "chunk", "composite_id", "lat", "lng", "label", "score", "lst_c", "anom_day", "landsat_anom", "eco_anom",
    "night_lst_c", "anom_night", "sealed", "green", "water", "tree", "ndvi", "dark_surface", "pop_density_km2",
    "valid_px", "n_obs", "terms", "updated_at",
]  # fmt: skip


async def _upsert(db: AsyncSession, rows: list[dict]) -> None:
    for i in range(0, len(rows), 1000):
        batch = rows[i : i + 1000]
        stmt = insert(HeatCell).values(batch)
        stmt = stmt.on_conflict_do_update(index_elements=["h3"], set_={k: getattr(stmt.excluded, k) for k in UPDATABLE})
        await db.execute(stmt)


def chunk_cells(chunk: str, ring: int = 1) -> list[str]:
    """All res-10 cells of a res-7 chunk and its k-ring neighbours (one job, one read)."""
    out: list[str] = []
    for c in h3.grid_disk(chunk, ring):
        out.extend(h3.cell_to_children(c, H.H3_RES))
    return sorted(out)


def region_cells(south: float, west: float, north: float, east: float) -> list[str]:
    poly = h3.LatLngPoly([(south, west), (south, east), (north, east), (north, west)])
    return sorted(h3.polygon_to_cells(poly, H.H3_RES))


_ = Resampling  # nearest is the default in read_to_grid
