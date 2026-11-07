"""Place names (prompt-v1 §6.4 L10, §5.3 'Place names') and IP-to-city (§5.2 DB-IP).

Reverse geocoding is cached per H3 res-9 cell and language in `place_labels` for 30 days. If
Nominatim is down, a stored label is served (stale), else coordinates.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path

import h3
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..http import UpstreamError
from ..models import PlaceLabel
from ..providers import nominatim, open_meteo

log = logging.getLogger("atmos.geo")
LABEL_TTL = timedelta(days=30)

# Bangladesh bounding box: fast country check without a network call.
BD = (20.6, 88.0, 26.7, 92.7)


def in_bangladesh(lat: float, lng: float) -> bool:
    return BD[0] <= lat <= BD[2] and BD[1] <= lng <= BD[3]


def coords_label(lat: float, lng: float) -> str:
    return f"{lat:.3f}, {lng:.3f}"


async def reverse(
    db: AsyncSession, lat: float, lng: float, lang: str, *, timeout: float = 4.0, allow_network: bool = True
) -> dict:
    """{place, city, country, country_code, near, live, stale, as_of}. Never raises."""
    key = h3.latlng_to_cell(lat, lng, 9)
    row = await db.get(PlaceLabel, (key, lang))
    now = datetime.now(UTC)
    if row and now - row.fetched_at < LABEL_TTL:
        return _out(row, live=True)
    if allow_network:
        try:
            r = await nominatim.reverse(lat, lng, lang, timeout=timeout)
            if r["place"]:
                stmt = insert(PlaceLabel).values(
                    key=key,
                    lang=lang,
                    label=r["place"][:200],
                    city=r["city"],
                    country=r["country"],
                    country_code=r["country_code"],
                    source="nominatim",
                    fetched_at=now,
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=["key", "lang"],
                    set_={
                        "label": stmt.excluded.label,
                        "city": stmt.excluded.city,
                        "country": stmt.excluded.country,
                        "country_code": stmt.excluded.country_code,
                        "fetched_at": now,
                    },
                )
                await db.execute(stmt)
                await db.commit()
                return {**r, "live": True, "stale": False, "as_of": now.isoformat()}
        except UpstreamError as e:
            log.info("nominatim unavailable", extra={"data": {"err": str(e)}})
    if row:
        return _out(row, live=False)
    cc = "BD" if in_bangladesh(lat, lng) else None
    return {
        "place": coords_label(lat, lng),
        "city": None,
        "country": None,
        "country_code": cc,
        "near": None,
        "live": False,
        "stale": False,
        "as_of": None,
    }


def _out(row: PlaceLabel, live: bool) -> dict:
    return {
        "place": row.label,
        "city": row.city,
        "country": row.country,
        "country_code": row.country_code,
        "near": None,
        "live": live,
        "stale": not live,
        "as_of": row.fetched_at.isoformat(),
    }


async def country_code(db: AsyncSession, lat: float, lng: float) -> str | None:
    if in_bangladesh(lat, lng):
        return "BD"
    r = await reverse(db, lat, lng, "en", allow_network=False)
    return r.get("country_code")


async def search(q: str, lang: str) -> list[dict]:
    q = q.strip()
    if len(q) < 2:
        return []
    return await open_meteo.geocode(q, lang)


# ── DB-IP City Lite (local file, no IP leaves the server) ───────────────────

_reader = None


def _dbip_path() -> Path | None:
    d = settings.data_path / "static"
    files = sorted(d.glob("dbip-city-lite-*.mmdb"))
    return files[-1] if files else None


def ip_city(ip: str) -> dict | None:
    global _reader
    p = _dbip_path()
    if p is None:
        return None
    if _reader is None:
        import maxminddb

        _reader = maxminddb.open_database(str(p))
    try:
        rec = _reader.get(ip)
    except ValueError:
        return None
    if not rec or "location" not in rec:
        return None
    city = (rec.get("city") or {}).get("names", {}).get("en")
    country = (rec.get("country") or {}).get("names", {}).get("en")
    return {
        "city": city,
        "country": country,
        "country_code": (rec.get("country") or {}).get("iso_code"),
        "location": {"lat": rec["location"]["latitude"], "lng": rec["location"]["longitude"]},
    }
