"""Zones and scans (prompt-v1 §9 'Zones')."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query

from ..deps import DB, ViewerDep
from ..schemas.common import lang_or_en
from ..schemas.zones import JobOut, ZoneDetailOut, ZonesScanOut
from ..services import projection, spots_read, zone_detail
from ..services import scan as svc

router = APIRouter(tags=["zones"])


@router.get("/zones", response_model=ZonesScanOut, operation_id="zones_scan")
async def zones(
    db: DB,
    viewer: ViewerDep,
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius_m: int = Query(200, ge=100, le=1000),
    lang: str = "en",
):
    return await svc.get_scan(db, viewer, lat, lng, radius_m, lang_or_en(lang))


@router.get("/zones/{zone_id}", response_model=ZoneDetailOut, operation_id="zone_detail")
async def zone(zone_id: str, db: DB, lang: str = "en"):
    return await zone_detail.detail(db, zone_id, lang_or_en(lang))


@router.get("/zones/{zone_id}/projection", operation_id="zone_projection")
async def zone_projection(
    zone_id: str,
    db: DB,
    trees: int = Query(0, ge=0, le=100000),
    roof_m2: int = Query(0, ge=0, le=10_000_000),
    shade: int = Query(0, ge=0, le=10000),
) -> dict:
    return await projection.projection(db, zone_id, trees, roof_m2, shade)


@router.get("/zones/{zone_id}/planting-spots", operation_id="zone_planting_spots")
async def zone_spots(zone_id: str, db: DB) -> dict:
    return await spots_read.read(db, zone_id)


@router.get("/scan-jobs/{job_id}", response_model=JobOut, operation_id="scan_job")
async def scan_job(job_id: uuid.UUID, db: DB):
    return await svc.job_status(db, job_id)
