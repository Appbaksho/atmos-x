"""`make static-data` (prompt-v1 §5.2): one-time downloads into DATA_DIR/static.

- DB-IP City Lite (monthly, CC BY 4.0): IP → city locally, so no user IP goes to a third party.
- LIS/OTD HRMC v2.3 lightning climatology (needs an Earthdata token).
- GPWv4.11 population density is not downloaded: the SEDAC site timed out and the 30″ global
  GeoTIFF is large; pop_density stays null and the Heat Score re-normalizes (reported).
"""

from __future__ import annotations

import asyncio
import gzip
import shutil
from datetime import UTC, datetime
from pathlib import Path

import httpx

from app.config import settings

DBIP = "https://download.db-ip.com/free/dbip-city-lite-{ym}.mmdb.gz"


def static_dir() -> Path:
    d = settings.data_path / "static"
    d.mkdir(parents=True, exist_ok=True)
    return d


async def _download(url: str, dest: Path, headers: dict | None = None) -> bool:
    tmp = dest.with_suffix(dest.suffix + ".part")
    async with httpx.AsyncClient(follow_redirects=True, timeout=600, headers={"User-Agent": settings.user_agent}) as c:
        async with c.stream("GET", url, headers=headers or {}) as r:
            if r.status_code != 200:
                print(f"  {url.split('/')[-1]}: HTTP {r.status_code}")
                return False
            with tmp.open("wb") as f:
                async for chunk in r.aiter_bytes(1 << 20):
                    f.write(chunk)
    tmp.replace(dest)
    return True


async def dbip() -> None:
    d = static_dir()
    now = datetime.now(UTC)
    months = [now.strftime("%Y-%m"), (now.replace(day=1) - __import__("datetime").timedelta(days=1)).strftime("%Y-%m")]
    for ym in months:
        out = d / f"dbip-city-lite-{ym}.mmdb"
        if out.exists():
            print(f"DB-IP {ym}: present")
            return
        gz = d / f"dbip-city-lite-{ym}.mmdb.gz"
        if await _download(DBIP.format(ym=ym), gz):
            with gzip.open(gz, "rb") as src, out.open("wb") as dst:
                shutil.copyfileobj(src, dst)
            gz.unlink()
            for old in d.glob("dbip-city-lite-*.mmdb"):
                if old != out:
                    old.unlink()
            print(f"DB-IP {ym}: {out.stat().st_size // 1_000_000} MB")
            return
    print("DB-IP: not available")


async def lisotd() -> None:
    from app.providers import earthdata as ed

    out = static_dir() / "LISOTD_HRMC_V2.3.2015.nc"
    if out.exists():
        print("LIS/OTD: present")
        return
    if not settings.earthdata_enabled:
        print("LIS/OTD: skipped (no Earthdata credential)")
        return
    url = await ed.presign(ed.LISOTD_URL, provider="ghrc")
    ok = await _download(url, out)
    print(f"LIS/OTD: {'ok ' + str(out.stat().st_size // 1_000_000) + ' MB' if ok else 'failed'}")


async def main() -> None:
    await dbip()
    await lisotd()


if __name__ == "__main__":
    asyncio.run(main())
