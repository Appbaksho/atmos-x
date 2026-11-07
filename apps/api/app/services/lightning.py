"""LIS/OTD lightning climatology (prompt-v1 §5.2, §7.9): monthly flash rate at a point.

HRMC_COM_FR: 0.5° grid [lat][lon][month], flashes km⁻² day⁻¹, 0 = fill. Downloaded once by
`make static-data`. Used only to weight the forecast-based lightning rule; labelled reference.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from ..config import settings

# Flash-rate reference: Dhaka's pre-monsoon months are ≈ 0.1–0.3; the weight is clamped to 0.5–2.
REF_RATE = 0.1


@lru_cache(maxsize=1)
def _grid():
    import h5py

    p = settings.data_path / "static" / "LISOTD_HRMC_V2.3.2015.nc"
    if not p.exists():
        return None
    with h5py.File(p, "r") as f:
        return np.array(f["HRMC_COM_FR"]), np.array(f["Latitude"]), np.array(f["Longitude"])


def flash_rate(lat: float, lng: float, month: int) -> float | None:
    g = _grid()
    if g is None:
        return None
    fr, lats, lons = g
    i = int(np.abs(lats - lat).argmin())
    j = int(np.abs(lons - lng).argmin())
    v = float(fr[i, j, month - 1])
    return None if v <= 0 else round(v, 4)


def weight(lat: float, lng: float, month: int) -> tuple[float, float | None]:
    r = flash_rate(lat, lng, month)
    if r is None:
        return 1.0, None
    return float(min(2.0, max(0.5, r / REF_RATE))), r
