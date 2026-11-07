"""NEX-GDDP-CMIP6 via NCCS THREDDS NCSS (prompt-v1 §5.2). Worker only; cached forever per 0.25° cell.

Daily tasmax (K) at the nearest grid point, as CSV. A few models and sampled years are enough for
an ensemble-mean hot-season delta (ssp245 vs historical). Never added to a MODIS trend (§5.4).
"""

from __future__ import annotations

import csv
import io

from ..http import fetch

PROVIDER = "nccs_thredds"
BASE = "https://ds.nccs.nasa.gov/thredds/ncss/grid/AMES/NEX/GDDP-CMIP6"
MODELS = ["ACCESS-CM2", "MRI-ESM2-0", "MIROC6"]
GRID = {"ACCESS-CM2": "gn", "MRI-ESM2-0": "gn", "MIROC6": "gn"}


def url(model: str, scenario: str, year: int, version: str = "v2.0") -> str:
    g = GRID.get(model, "gn")
    return f"{BASE}/{model}/{scenario}/r1i1p1f1/tasmax/tasmax_day_{model}_{scenario}_r1i1p1f1_{g}_{year}_{version}.nc"


async def tasmax(
    model: str, scenario: str, year: int, lat: float, lng: float, months: list[int], *, timeout: float = 120
) -> list[float]:
    """Daily tasmax (°C) for the given months of one year. Tries the v2.0 file, then the unversioned one."""
    m0, m1 = min(months), max(months)
    params = {
        "var": "tasmax",
        "latitude": round(lat, 3),
        "longitude": round(lng % 360, 3),
        "time_start": f"{year}-{m0:02d}-01T12:00:00Z",
        "time_end": f"{year}-{m1:02d}-28T12:00:00Z",
        "accept": "csv",
    }
    last = None
    for version in ("v2.0", "v1.1", ""):
        u = url(model, scenario, year, version) if version else url(model, scenario, year).replace("_v2.0.nc", ".nc")
        try:
            r = await fetch(PROVIDER, "GET", u, params=params, timeout=timeout, retries=1)
        except Exception as e:
            last = e
            continue
        rows = list(csv.reader(io.StringIO(r.text)))
        if len(rows) < 2:
            continue
        head = [h.lower() for h in rows[0]]
        idx = next(i for i, h in enumerate(head) if h.startswith("tasmax"))
        out = []
        for row in rows[1:]:
            try:
                k = float(row[idx])
            except (ValueError, IndexError):
                continue
            if 150 < k < 350:
                out.append(k - 273.15)
        return out
    raise last or RuntimeError("no CMIP6 file answered")
