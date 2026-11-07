"""NASA Earthdata (prompt-v1 §5.2): ECOSTRESS, GPM IMERG, SMAP L4, LIS/OTD. Credential-gated.

Auth: EARTHDATA_TOKEN as a bearer token when set and unexpired; otherwise
`find_or_create_token` with EARTHDATA_USERNAME/PASSWORD (urs.earthdata.nasa.gov must be reachable).
Protected assets redirect to presigned S3/CloudFront URLs; GDAL must not forward the bearer header to
those, so `presign()` resolves the redirect with httpx and GDAL reads the presigned URL.
"""

from __future__ import annotations

import base64
import json
import time
from datetime import UTC, date, datetime, timedelta

from ..config import settings
from ..http import UpstreamError, client, fetch, get_json

URS = "https://urs.earthdata.nasa.gov"
CMR = "https://cmr.earthdata.nasa.gov"
ECOSTRESS_COLLECTION = "ECO_L2T_LSTE_002"
IMERG_DAILY_CONCEPT = "C2723754850-GES_DISC"
SMAP_CONCEPT = "C3480440870-NSIDC_CPRD"
LISOTD_URL = "https://data.ghrc.earthdata.nasa.gov/ghrcw-protected/lohrmc__2.3.2015/LISOTD_HRMC_V2.3.2015.nc"

_token: tuple[str, float] | None = None
_presigned: dict[str, tuple[str, float]] = {}
_sizes: dict[str, int] = {}


def _jwt_exp(tok: str) -> float | None:
    try:
        p = tok.split(".")[1]
        p += "=" * (-len(p) % 4)
        return float(json.loads(base64.urlsafe_b64decode(p)).get("exp"))
    except Exception:
        return None


async def token() -> str:
    """A bearer token, or UpstreamError('earthdata', ...) when none can be had."""
    global _token
    now = time.time()
    if _token and _token[1] - now > 3600:
        return _token[0]
    if settings.earthdata_token:
        exp = _jwt_exp(settings.earthdata_token) or (now + 86400)
        if exp - now > 3600:
            _token = (settings.earthdata_token, exp)
            return settings.earthdata_token
    if settings.earthdata_username and settings.earthdata_password:
        r = await fetch(
            "urs",
            "POST",
            f"{URS}/api/users/find_or_create_token",
            auth=(settings.earthdata_username, settings.earthdata_password),
            timeout=20,
            retries=1,
        )
        j = r.json()
        exp = datetime.strptime(j["expiration_date"], "%m/%d/%Y").replace(tzinfo=UTC).timestamp()
        _token = (j["access_token"], exp)
        return _token[0]
    raise UpstreamError("earthdata", "no credential")


async def bearer() -> dict:
    return {"Authorization": f"Bearer {await token()}"}


async def presign(href: str, provider: str = "lpdaac") -> str:
    """Follow the protected-asset redirect once; cache the presigned URL for 45 minutes."""
    hit = _presigned.get(href)
    if hit and hit[1] > time.time():
        return hit[0]
    headers = {**(await bearer()), "Range": "bytes=0-0"}
    try:
        r = await client().get(href, headers=headers, follow_redirects=True, timeout=60)
    except Exception as e:
        raise UpstreamError(provider, type(e).__name__) from e
    if r.status_code not in (200, 206):
        raise UpstreamError(provider, f"HTTP {r.status_code}", status=r.status_code)
    final = str(r.url)
    _presigned[href] = (final, time.time() + 45 * 60)
    cr = r.headers.get("content-range", "")
    if "/" in cr and cr.rsplit("/", 1)[1].isdigit():
        _sizes[final] = int(cr.rsplit("/", 1)[1])
    return final


def size_of(url: str) -> int | None:
    """Total size learned from the presign range request (presigned URLs may refuse HEAD)."""
    return _sizes.get(url)


# ── ECOSTRESS ──────────────────────────────────────────────────────────────


async def ecostress_passes(bbox: list[float], start: date, end: date) -> list[dict]:
    j = (
        await fetch(
            "cmr",
            "POST",
            f"{CMR}/stac/LPCLOUD/search",
            json={
                "collections": [ECOSTRESS_COLLECTION],
                "bbox": bbox,
                "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
                "limit": 200,
            },
            timeout=60,
            retries=2,
        )
    ).json()
    out = []
    for f in j.get("features", []):
        assets = {}
        for k, v in f["assets"].items():
            if k.startswith("s3_"):
                continue
            for sfx in ("_LST", "_LST_err", "_cloud", "_water", "_QC"):
                if k.endswith(sfx):
                    assets[sfx[1:]] = v["href"]
        if "LST" in assets:
            out.append(
                {
                    "id": f["id"],
                    "datetime": f["properties"]["datetime"],
                    "assets": assets,
                    "geometry": f.get("geometry"),
                }
            )
    return out


def local_solar_hour(dt_utc: datetime, lng: float) -> float:
    return (dt_utc.hour + dt_utc.minute / 60 + lng / 15) % 24


# ── IMERG / SMAP granule discovery ─────────────────────────────────────────


async def cmr_granules(concept: str, start: date, end: date, page_size: int = 50) -> list[dict]:
    j = await get_json(
        "cmr",
        f"{CMR}/search/granules.json",
        params={
            "concept_id": concept,
            "temporal": f"{start}T00:00:00Z,{end}T23:59:59Z",
            "sort_key": "-start_date",
            "page_size": page_size,
        },
        timeout=60,
        retries=2,
    )
    return j["feed"]["entry"]


def https_link(g: dict, suffix: str) -> str | None:
    return next(
        (
            ln["href"]
            for ln in g.get("links", [])
            if ln["href"].startswith("https") and ln["href"].endswith(suffix) and "opendap" not in ln["href"]
        ),
        None,
    )


def imerg_index(lat: float, lng: float) -> tuple[int, int]:
    """IMERG V07 0.1° grid: lon −179.95…179.95 (3600), lat −89.95…89.95 (1800); array is [time][lon][lat]."""
    return round((lng + 179.95) / 0.1), round((lat + 89.95) / 0.1)


# EASE-Grid 2.0 global 9 km (SMAP L4): cylindrical equal-area, 3856 × 1624 cells.
EASE2_M09 = {"cols": 3856, "rows": 1624, "cell_m": 9008.055210146, "r0": 0}
EASE2_A = 6378137.0
EASE2_E = 0.0818191908426215
EASE2_PHI1 = 30.0


def ease2_m09_index(lat: float, lng: float) -> tuple[int, int]:
    """Row, col of the EASE-Grid 2.0 global 9 km cell containing (lat, lng)."""
    import math

    e2 = EASE2_E**2
    phi1 = math.radians(EASE2_PHI1)
    k0 = math.cos(phi1) / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    phi = math.radians(lat)
    sinphi = math.sin(phi)
    q = (1 - e2) * (
        sinphi / (1 - e2 * sinphi**2) - (1 / (2 * EASE2_E)) * math.log((1 - EASE2_E * sinphi) / (1 + EASE2_E * sinphi))
    )
    x = EASE2_A * k0 * math.radians(lng)
    y = EASE2_A * q / (2 * k0)
    c = EASE2_M09["cell_m"]
    col = int(math.floor(x / c + EASE2_M09["cols"] / 2))
    row = int(math.floor(EASE2_M09["rows"] / 2 - y / c))
    return max(0, min(EASE2_M09["rows"] - 1, row)), max(0, min(EASE2_M09["cols"] - 1, col))


_ = timedelta
