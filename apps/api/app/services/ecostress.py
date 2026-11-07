"""ECOSTRESS sharpening and night heat (prompt-v1 §7.1 steps 8–9). Needs an Earthdata token.

For each pass within 09:00–15:00 local solar time with cloud = 0, water = 0 and LST_err ≤ 2 K:
hex mean minus the median over the job window. The median across passes is the relative day
pattern blended with Landsat (0.7/0.3). ECOSTRESS never replaces the absolute Landsat value, because
passes happen at different hours. Night passes (20:00–05:00) give night surface temperature.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import date, datetime

import numpy as np

from ..engines import raster as R
from ..providers import earthdata as ed
from ..providers.rasterio_io import Grid, read_to_grid

log = logging.getLogger("atmos.ecostress")
ORBIT = re.compile(r"ECOv002_L2T_LSTE_(\d+)_")

MAX_DAY = 6
MAX_NIGHT = 4
# Plan: ≤ 2 K. Real Dhaka clear passes report 3.1–3.4 K (D19), so 2 K discards every pass; the
# blend uses the relative pattern only, where a uniform error cancels.
MAX_ERR_K = 3.5
MIN_VALID = 0.2


async def _read_pass(grid: Grid, assets: dict) -> np.ndarray | None:
    try:
        urls = await asyncio.gather(*[ed.presign(assets[k]) for k in ("LST", "cloud", "water") if k in assets])
        lst, cloud, water = await asyncio.gather(
            read_to_grid(urls[0], grid, src_nodata=float("nan")),
            read_to_grid(urls[1], grid, src_nodata=255),
            read_to_grid(urls[2], grid, src_nodata=255),
        )
        err = None
        if "LST_err" in assets:
            err = await read_to_grid(await ed.presign(assets["LST_err"]), grid, src_nodata=float("nan"))
    except Exception as e:
        log.warning("ecostress read failed", extra={"data": {"err": str(e)[:200]}})
        return None
    lst = lst.astype(np.float32)
    lst[lst == 0] = np.nan
    # LST is Kelvin (float32, NaN fill; checked on first read, D19). Guard against a Celsius file.
    if np.nanmedian(lst) > 200 if np.isfinite(lst).any() else False:
        lst = lst - R.K_TO_C
    ok = (cloud == 0) & (water == 0) & np.isfinite(lst)
    if err is not None:
        ok &= np.isfinite(err) & (err <= MAX_ERR_K)
    lst[~ok] = np.nan
    lst[(lst < -40) | (lst > 80)] = np.nan
    return lst


async def layer(
    grid: Grid, codes: np.ndarray, n: int, start: date, end: date, bbox
) -> tuple[np.ndarray | None, np.ndarray | None, int]:
    passes = await ed.ecostress_passes(list(bbox), start, end)
    lng0 = (bbox[0] + bbox[2]) / 2
    # One orbit = one pass, split into consecutive scenes and MGRS tiles: merge them all.
    groups: dict[str, list[dict]] = {}
    when: dict[str, str] = {}
    for p in passes:
        m = ORBIT.search(p["id"])
        key = m.group(1) if m else p["datetime"][:16]
        groups.setdefault(key, []).append(p)
        when[key] = min(when.get(key, p["datetime"]), p["datetime"])
    day_keys, night_keys = [], []
    for k in sorted(groups, key=lambda g: when[g], reverse=True):
        h = ed.local_solar_hour(datetime.fromisoformat(when[k].replace("Z", "+00:00")), lng0)
        if 9 <= h <= 15 and len(day_keys) < MAX_DAY:
            day_keys.append(k)
        elif (h >= 20 or h <= 5) and len(night_keys) < MAX_NIGHT:
            night_keys.append(k)
    inside = codes >= 0

    async def hex_mean(k: str) -> np.ndarray | None:
        merged: np.ndarray | None = None
        for p in groups[k]:
            a = await _read_pass(grid, p["assets"])
            if a is None:
                continue
            merged = a if merged is None else np.where(np.isfinite(merged), merged, a)
        if merged is None or np.isfinite(merged[inside]).mean() < MIN_VALID:
            return None
        return R.aggregate_by_cell(codes, merged, n)[0]

    day_means = [m for m in await asyncio.gather(*[hex_mean(k) for k in day_keys]) if m is not None]
    night_means = [m for m in await asyncio.gather(*[hex_mean(k) for k in night_keys]) if m is not None]
    eco_anom = None
    if day_means:
        anoms = [m - np.nanmedian(m) for m in day_means]
        eco_anom = R.nan_median_stack([a.astype(np.float32) for a in anoms])[0]
    night = R.nan_median_stack([m.astype(np.float32) for m in night_means])[0] if night_means else None
    log.info(
        "ecostress layer", extra={"data": {"day": len(day_means), "night": len(night_means), "candidates": len(groups)}}
    )
    return eco_anom, night, len(day_means) + len(night_means)
