"""Conditions, air, geo and map layer routes (prompt-v1 §9)."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from ..deps import DB, ViewerDep
from ..errors import AppError
from ..http import UpstreamError
from ..schemas.common import lang_or_en
from ..services import air as air_svc
from ..services import conditions as cond_svc
from ..services import geo as geo_svc
from ..services import gibs as gibs_svc
from ..sources import SRC

router = APIRouter(tags=["weather"])


def _unavailable(what: str) -> AppError:
    return AppError(503, f"{what}.unavailable", f"{what.capitalize()} data is unavailable right now")


@router.get("/conditions", operation_id="conditions")
async def conditions(
    db: DB, lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180), lang: str = "en"
) -> dict:
    try:
        return await cond_svc.conditions(db, lat, lng, lang_or_en(lang))
    except UpstreamError:
        raise _unavailable("conditions")


@router.get("/air", operation_id="air")
async def air(
    db: DB, viewer: ViewerDep, lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180)
) -> dict:
    try:
        return await air_svc.air(db, lat, lng, viewer.user)
    except UpstreamError:
        raise _unavailable("air")


@router.get("/geo/reverse", operation_id="geo_reverse")
async def reverse(
    db: DB, lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180), lang: str = "en"
) -> dict:
    r = await geo_svc.reverse(db, lat, lng, lang_or_en(lang))
    return {
        "place": r["place"],
        "city": r["city"],
        "country": r["country"],
        "country_code": r["country_code"],
        "meta": {
            "live": r["live"],
            "stale": r["stale"],
            "generated_at": r["as_of"] or "",
            "sources": [SRC["nominatim"].src(as_of=r["as_of"]).model_dump()],
        },
    }


@router.get("/geo/search", operation_id="geo_search")
async def search(q: str = Query(min_length=1, max_length=120), lang: str = "en") -> dict:
    try:
        results = await geo_svc.search(q, lang_or_en(lang))
    except UpstreamError:
        raise _unavailable("search")
    return {
        "results": results,
        "meta": {"live": True, "stale": False, "generated_at": "", "sources": [SRC["open_meteo"].src().model_dump()]},
    }


@router.get("/geo/ip", operation_id="geo_ip")
async def ip(request: Request, viewer: ViewerDep) -> dict:
    """City from the caller's IP using the local DB-IP file (no IP goes to a third party)."""
    r = geo_svc.ip_city(viewer.ip)
    return {
        "result": r,
        "meta": {
            "live": r is not None,
            "stale": False,
            "generated_at": "",
            "sources": [SRC["dbip"].src().model_dump()],
        },
    }


@router.get("/map/gibs", operation_id="map_gibs")
async def gibs(db: DB) -> dict:
    return await gibs_svc.layer(db)
