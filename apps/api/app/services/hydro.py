"""Rain (GPM IMERG Early) and soil wetness (SMAP L4) per 0.1° cell (prompt-v1 §5.2, §5.3, §7.9).

IMERG: the daily file (≈ 28 MB, global) is downloaded once per day by the worker, sampled for every
requested cell, and deleted after 4 days. Satellite-estimated, near-real-time: labelled so.
SMAP L4 SPL4SMGP v008: 3-hourly, 9 km, about 2 days behind. Granules are large, so h5py reads them
through HTTP range requests and fetches only the chunks it needs.
Both cache per 0.1° cell per day (24 h). Without an Earthdata token the chain falls back to POWER.
"""

from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import h5py
import httpx
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..http import UpstreamError
from ..providers import earthdata as ed
from . import cache

log = logging.getLogger("atmos.hydro")
TTL = timedelta(hours=24)
_dl_lock = asyncio.Lock()


def cell01(lat: float, lng: float) -> tuple[float, float]:
    return round(round(lat * 10) / 10, 1), round(round(lng * 10) / 10, 1)


def imerg_key(lat: float, lng: float) -> str:
    a, b = cell01(lat, lng)
    return f"imerg:{a},{b}"


def smap_key(lat: float, lng: float) -> str:
    a, b = cell01(lat, lng)
    return f"smap:{a},{b}"


def _imerg_dir() -> Path:
    d = settings.data_path / "cache" / "imerg"
    d.mkdir(parents=True, exist_ok=True)
    return d


async def _imerg_file(day: date) -> Path | None:
    path = _imerg_dir() / f"{day.isoformat()}.nc4"
    if path.exists() and path.stat().st_size > 1_000_000:
        return path
    async with _dl_lock:
        if path.exists() and path.stat().st_size > 1_000_000:
            return path
        grans = await ed.cmr_granules(ed.IMERG_DAILY_CONCEPT, day, day, page_size=2)
        href = next((ed.https_link(g, ".nc4") for g in grans if ed.https_link(g, ".nc4")), None)
        if not href:
            return None
        tmp = path.with_suffix(".part")
        url = await ed.presign(href, provider="gesdisc")
        async with httpx.AsyncClient(follow_redirects=True, timeout=300) as c:
            async with c.stream("GET", url) as r:
                if r.status_code != 200:
                    raise UpstreamError("gesdisc", f"HTTP {r.status_code}", status=r.status_code)
                with tmp.open("wb") as f:
                    async for chunk in r.aiter_bytes(1 << 20):
                        f.write(chunk)
        tmp.replace(path)
    for old in _imerg_dir().glob("*.nc4"):
        try:
            if date.fromisoformat(old.stem) < day - timedelta(days=4):
                old.unlink()
        except ValueError:
            pass
    return path


def _sample_imerg(path: Path, lat: float, lng: float) -> float | None:
    lo, la = ed.imerg_index(lat, lng)
    with h5py.File(path, "r") as f:
        ds = f["precipitation"] if "precipitation" in f else f["Grid/precipitation"]
        v = float(ds[0, lo, la])
        fill = ds.attrs.get("_FillValue")
    if fill is not None and np.isclose(v, float(np.asarray(fill).ravel()[0])):
        return None
    return None if v < 0 or not np.isfinite(v) else round(v, 1)


async def refresh_imerg(db: AsyncSession, lat: float, lng: float, days: int = 3) -> dict:
    """mm/day for the last `days` complete days available (daily Early run lags about 1–2 days)."""
    out: dict[str, float | None] = {}
    today = datetime.now(UTC).date()
    d = today - timedelta(days=1)
    tries = 0
    while len(out) < days and tries < days + 4:
        tries += 1
        try:
            p = await _imerg_file(d)
        except UpstreamError:
            p = None
        if p is not None:
            out[d.isoformat()] = await asyncio.to_thread(_sample_imerg, p, lat, lng)
        d -= timedelta(days=1)
    if not out:
        raise UpstreamError("gesdisc", "no IMERG day available")
    vals = [v for v in out.values() if v is not None]
    value = {"days": out, "sum_mm": round(sum(vals), 1) if vals else None, "units": "mm/day"}
    await cache.write(db, imerg_key(lat, lng), "imerg", value, TTL, as_of=max(out))
    return value


class HttpRangeFile:
    """Read-only, seekable file over HTTP range requests with a small block cache (for h5py)."""

    BLOCK = 1 << 20

    def __init__(self, url: str, size: int):
        self.url = url
        self.size = size
        self.pos = 0
        self.blocks: OrderedDict[int, bytes] = OrderedDict()
        self.client = httpx.Client(follow_redirects=True, timeout=120)

    def seekable(self) -> bool:
        return True

    def readable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = 0) -> int:
        self.pos = offset if whence == 0 else (self.pos + offset if whence == 1 else self.size + offset)
        return self.pos

    def _block(self, i: int) -> bytes:
        if i in self.blocks:
            self.blocks.move_to_end(i)
            return self.blocks[i]
        start = i * self.BLOCK
        end = min(self.size, start + self.BLOCK) - 1
        r = self.client.get(self.url, headers={"Range": f"bytes={start}-{end}"})
        r.raise_for_status()
        self.blocks[i] = r.content
        if len(self.blocks) > 64:
            self.blocks.popitem(last=False)
        return r.content

    def read(self, n: int = -1) -> bytes:
        if n < 0:
            n = self.size - self.pos
        n = max(0, min(n, self.size - self.pos))
        out = bytearray()
        while n > 0:
            i = self.pos // self.BLOCK
            off = self.pos - i * self.BLOCK
            b = self._block(i)[off : off + n]
            if not b:
                break
            out += b
            self.pos += len(b)
            n -= len(b)
        return bytes(out)

    def readinto(self, buf) -> int:
        data = self.read(len(buf))
        buf[: len(data)] = data
        return len(data)

    def close(self) -> None:
        self.client.close()


def _sample_smap(url: str, size: int, lat: float, lng: float) -> dict:
    row, col = ed.ease2_m09_index(lat, lng)
    f = HttpRangeFile(url, size)
    try:
        with h5py.File(f, "r") as h:
            g = h["Geophysical_Data"]
            root = float(g["sm_rootzone_wetness"][row, col])
            surf = float(g["sm_surface_wetness"][row, col])
    finally:
        f.close()
    fix = lambda v: None if not np.isfinite(v) or v < 0 or v > 1 else round(v, 3)  # noqa: E731  fill is −9999
    return {"rootzone_wetness": fix(root), "surface_wetness": fix(surf), "row": row, "col": col}


async def refresh_smap(db: AsyncSession, lat: float, lng: float) -> dict:
    today = datetime.now(UTC).date()
    grans = await ed.cmr_granules(ed.SMAP_CONCEPT, today - timedelta(days=5), today, page_size=4)
    for g in grans:
        href = ed.https_link(g, ".h5")
        if not href:
            continue
        url = await ed.presign(href, provider="nsidc")
        size = ed.size_of(url) or 0
        if not size:
            continue
        v = await asyncio.to_thread(_sample_smap, url, size, lat, lng)
        v["time"] = g["time_start"]
        await cache.write(db, smap_key(lat, lng), "smap", v, TTL, as_of=g["time_start"][:16])
        return v
    raise UpstreamError("nsidc", "no SMAP granule available")
