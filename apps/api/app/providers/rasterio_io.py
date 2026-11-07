"""Read COG windows onto a common grid (prompt-v1 §7.1). Blocking rasterio calls run in threads.

A `Grid` is a UTM 30 m target (or 10 m for land cover) snapped to whole metres. Every source is
read through a WarpedVRT onto that grid, so scenes from different paths, rows or projections line
up pixel for pixel. Nearest-neighbour keeps values unmixed; MODIS 1 km pixels simply repeat.
"""

from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass
from functools import lru_cache

import h3
import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.enums import Resampling
from rasterio.transform import Affine
from rasterio.vrt import WarpedVRT

GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "GDAL_HTTP_MULTIRANGE": "YES",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    "GDAL_HTTP_MAX_RETRY": "3",
    "GDAL_HTTP_RETRY_DELAY": "2",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.TIF,.tiff",
    "VSI_CACHE": "TRUE",
    "GDAL_HTTP_TIMEOUT": "60",
}

# At most 4 concurrent pixel reads (§7.1 step 2).
READ_SLOTS = asyncio.Semaphore(4)


@dataclass(frozen=True)
class Grid:
    crs: str  # e.g. "EPSG:32646"
    transform: tuple[float, float, float, float, float, float]
    width: int
    height: int

    @property
    def affine(self) -> Affine:
        return Affine(*self.transform)

    @property
    def res(self) -> float:
        return self.transform[0]

    def scaled(self, factor: int) -> Grid:
        """Same extent at res/factor (10 m land cover aligned to the 30 m grid)."""
        a = self.affine
        return Grid(
            self.crs, (a.a / factor, a.b, a.c, a.d, a.e / factor, a.f), self.width * factor, self.height * factor
        )


def utm_epsg(lat: float, lng: float) -> str:
    zone = int((lng + 180) // 6) + 1
    return f"EPSG:{(32600 if lat >= 0 else 32700) + zone}"


def grid_for_bbox(bbox: tuple[float, float, float, float], res: float = 30.0, crs: str | None = None) -> Grid:
    """bbox = (west, south, east, north) in WGS84 → a UTM grid snapped to multiples of `res`."""
    w, s, e, n = bbox
    crs = crs or utm_epsg((s + n) / 2, (w + e) / 2)
    tr = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    xs, ys = tr.transform([w, e, w, e], [s, s, n, n])
    x0 = math.floor(min(xs) / res) * res
    y1 = math.ceil(max(ys) / res) * res
    x1 = math.ceil(max(xs) / res) * res
    y0 = math.floor(min(ys) / res) * res
    width = int(round((x1 - x0) / res))
    height = int(round((y1 - y0) / res))
    return Grid(crs, (res, 0.0, x0, 0.0, -res, y1), width, height)


def _read(url: str, grid: Grid, resampling: Resampling, band: int, headers: dict | None, src_nodata) -> np.ndarray:
    env = dict(GDAL_ENV)
    if headers:
        env["GDAL_HTTP_HEADERS"] = "\r\n".join(f"{k}: {v}" for k, v in headers.items())
    with rasterio.Env(**env):
        with rasterio.open(url) as src:
            nodata = src.nodata if src_nodata is None else src_nodata
            with WarpedVRT(
                src,
                crs=grid.crs,
                transform=grid.affine,
                width=grid.width,
                height=grid.height,
                resampling=resampling,
                src_nodata=nodata,
                nodata=nodata if nodata is not None else 0,
            ) as vrt:
                return vrt.read(band)


async def read_to_grid(
    url: str,
    grid: Grid,
    *,
    resampling: Resampling = Resampling.nearest,
    band: int = 1,
    headers: dict | None = None,
    src_nodata=None,
) -> np.ndarray:
    async with READ_SLOTS:
        return await asyncio.to_thread(_read, url, grid, resampling, band, headers, src_nodata)


@lru_cache(maxsize=16)
def _pixel_latlng(grid: Grid) -> tuple[np.ndarray, np.ndarray]:
    a = grid.affine
    cols = np.arange(grid.width) + 0.5
    rows = np.arange(grid.height) + 0.5
    xs = a.c + cols * a.a
    ys = a.f + rows * a.e
    xx, yy = np.meshgrid(xs, ys)
    tr = Transformer.from_crs(CRS.from_user_input(grid.crs), "EPSG:4326", always_xy=True)
    lng, lat = tr.transform(xx, yy)
    return np.asarray(lat), np.asarray(lng)


def pixel_codes(grid: Grid, cells: list[str], res: int = 10) -> np.ndarray:
    """For each grid pixel, the index of its H3 cell in `cells` (−1 when outside the set)."""
    lat, lng = _pixel_latlng(grid)
    index = {c: i for i, c in enumerate(cells)}
    flat_lat = lat.ravel()
    flat_lng = lng.ravel()
    out = np.full(flat_lat.shape[0], -1, dtype=np.int64)
    to_cell = h3.latlng_to_cell
    get = index.get
    for i in range(flat_lat.shape[0]):
        j = get(to_cell(flat_lat[i], flat_lng[i], res))
        if j is not None:
            out[i] = j
    return out.reshape(lat.shape)


def cells_bbox(cells: list[str], pad_deg: float = 0.002) -> tuple[float, float, float, float]:
    lats, lngs = [], []
    for c in cells:
        for la, ln in h3.cell_to_boundary(c):
            lats.append(la)
            lngs.append(ln)
    return (min(lngs) - pad_deg, min(lats) - pad_deg, max(lngs) + pad_deg, max(lats) + pad_deg)


def _read_point(url: str, lat: float, lng: float, band: int, headers: dict | None):
    env = dict(GDAL_ENV)
    if headers:
        env["GDAL_HTTP_HEADERS"] = "\r\n".join(f"{k}: {v}" for k, v in headers.items())
    with rasterio.Env(**env):
        with rasterio.open(url) as src:
            tr = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
            x, y = tr.transform(lng, lat)
            row, col = src.index(x, y)
            if not (0 <= row < src.height and 0 <= col < src.width):
                return None
            v = src.read(band, window=((row, row + 1), (col, col + 1)))[0, 0]
            return v.item() if hasattr(v, "item") else v


async def read_point(url: str, lat: float, lng: float, *, band: int = 1, headers: dict | None = None):
    async with READ_SLOTS:
        return await asyncio.to_thread(_read_point, url, lat, lng, band, headers)
