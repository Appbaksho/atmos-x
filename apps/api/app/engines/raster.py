"""Pixel maths for the heat pipeline (prompt-v1 §5.2, §7.1). Pure numpy, no I/O.

Every conversion here is unit-tested. Fill values become NaN, never numbers (§4 rule 4).
"""

from __future__ import annotations

import numpy as np

K_TO_C = 273.15

# Landsat Collection 2 Level-2 (USGS): ST_B10 / lwir11 and surface reflectance scale factors.
LANDSAT_ST_SCALE = 0.00341802
LANDSAT_ST_OFFSET = 149.0
LANDSAT_SR_SCALE = 0.0000275
LANDSAT_SR_OFFSET = -0.2
# qa_pixel bits: 0 fill, 1 dilated cloud, 2 cirrus, 3 cloud, 4 cloud shadow, 5 snow. Water is valid.
LANDSAT_QA_BAD = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5)

# MODIS MOD11/MYD11 v6.1 LST: uint16, 0 = fill, scale 0.02 K.
MODIS_LST_SCALE = 0.02

# HLS v2.0: int16 reflectance, −9999 nodata, scale 0.0001. Fmask bits 1 cloud, 2 adjacent, 3 shadow, 4 snow.
HLS_SCALE = 0.0001
HLS_NODATA = -9999
HLS_FMASK_BAD = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4)
HLS_FMASK_NODATA = 255

# ESA WorldCover v200 classes.
WC_TREE, WC_SHRUB, WC_GRASS, WC_CROP, WC_BUILT, WC_BARE, WC_SNOW, WC_WATER, WC_WETLAND, WC_MANGROVE, WC_MOSS = (
    10,
    20,
    30,
    40,
    50,
    60,
    70,
    80,
    90,
    95,
    100,
)
WC_GREEN = (WC_TREE, WC_SHRUB, WC_GRASS, WC_CROP, WC_WETLAND, WC_MANGROVE)

# Albedo per Liang (2001) for Landsat OLI surface reflectance.
LIANG = {"blue": 0.356, "red": 0.130, "nir": 0.373, "swir1": 0.085, "swir2": 0.072, "c": -0.0018}
DARK_ALBEDO = 0.15


def landsat_st_to_c(dn: np.ndarray) -> np.ndarray:
    """Landsat C2 L2 surface temperature DN → °C. DN 0 is nodata → NaN."""
    dn = dn.astype(np.float32)
    out = dn * LANDSAT_ST_SCALE + LANDSAT_ST_OFFSET - K_TO_C
    out[dn == 0] = np.nan
    return out


def landsat_clear(qa: np.ndarray) -> np.ndarray:
    """True where qa_pixel shows no fill, cloud, dilated cloud, cirrus, shadow or snow."""
    return (qa.astype(np.uint16) & LANDSAT_QA_BAD) == 0


def landsat_sr(dn: np.ndarray) -> np.ndarray:
    dn = dn.astype(np.float32)
    out = dn * LANDSAT_SR_SCALE + LANDSAT_SR_OFFSET
    out[dn == 0] = np.nan
    return out


def albedo_liang(blue, red, nir, swir1, swir2) -> np.ndarray:
    a = (
        LIANG["blue"] * blue
        + LIANG["red"] * red
        + LIANG["nir"] * nir
        + LIANG["swir1"] * swir1
        + LIANG["swir2"] * swir2
        + LIANG["c"]
    )
    return a.astype(np.float32)


def modis_lst_to_c(dn: np.ndarray) -> np.ndarray:
    dn = dn.astype(np.float32)
    out = dn * MODIS_LST_SCALE - K_TO_C
    out[dn == 0] = np.nan
    return out


def hls_reflectance(dn: np.ndarray) -> np.ndarray:
    dn = dn.astype(np.float32)
    out = dn * HLS_SCALE
    out[dn == HLS_NODATA] = np.nan
    return out


def hls_clear(fmask: np.ndarray) -> np.ndarray:
    f = fmask.astype(np.uint8)
    return (f != HLS_FMASK_NODATA) & ((f & HLS_FMASK_BAD) == 0)


def ndvi(red: np.ndarray, nir: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        v = (nir - red) / (nir + red)
    v = v.astype(np.float32)
    v[~np.isfinite(v)] = np.nan
    return np.clip(v, -1, 1)


def k_to_c(k: float) -> float:
    return k - K_TO_C


def c_to_k(c: float) -> float:
    return c + K_TO_C


def nan_median_stack(stack: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """Per-pixel median across scenes and the count of valid observations."""
    if not stack:
        raise ValueError("empty stack")
    arr = np.stack(stack).astype(np.float32)
    count = np.sum(np.isfinite(arr), axis=0).astype(np.int16)
    with np.errstate(all="ignore"):
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=RuntimeWarning)
            med = np.nanmedian(arr, axis=0)
    return med.astype(np.float32), count


def class_fractions_30m(wc10: np.ndarray, classes: tuple[int, ...]) -> np.ndarray:
    """10 m class raster (3H × 3W, aligned to a 30 m grid) → per-30 m-pixel fraction of `classes`.

    Pixels with no WorldCover value (0) do not count in the denominator.
    """
    h, w = wc10.shape[0] // 3, wc10.shape[1] // 3
    blk = wc10[: h * 3, : w * 3].reshape(h, 3, w, 3)
    valid = (blk > 0).sum(axis=(1, 3)).astype(np.float32)
    hit = np.isin(blk, classes).sum(axis=(1, 3)).astype(np.float32)
    with np.errstate(divide="ignore", invalid="ignore"):
        out = hit / valid
    out[valid == 0] = np.nan
    return out


def aggregate_by_cell(codes: np.ndarray, values: np.ndarray, n_cells: int) -> tuple[np.ndarray, np.ndarray]:
    """Mean of finite `values` per cell code (0..n_cells-1; −1 = outside). Returns (mean, count)."""
    v = values.ravel()
    c = codes.ravel()
    ok = (c >= 0) & np.isfinite(v)
    sums = np.bincount(c[ok], weights=v[ok], minlength=n_cells)
    cnt = np.bincount(c[ok], minlength=n_cells)
    with np.errstate(divide="ignore", invalid="ignore"):
        mean = sums / cnt
    mean[cnt == 0] = np.nan
    return mean, cnt


def median_by_cell(codes: np.ndarray, values: np.ndarray, n_cells: int) -> np.ndarray:
    v = values.ravel()
    c = codes.ravel()
    ok = (c >= 0) & np.isfinite(v)
    out = np.full(n_cells, np.nan)
    if not ok.any():
        return out
    order = np.argsort(c[ok], kind="stable")
    cs, vs = c[ok][order], v[ok][order]
    bounds = np.flatnonzero(np.diff(cs)) + 1
    for grp_c, grp_v in zip(np.split(cs, bounds), np.split(vs, bounds), strict=True):
        out[grp_c[0]] = float(np.median(grp_v))
    return out
