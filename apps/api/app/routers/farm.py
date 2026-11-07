"""Farmer alerts and saved fields (prompt-v1 §7.9, §9 'Air and farmer')."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..deps import DB, FullUser, ViewerDep
from ..errors import AppError
from ..models import FarmField
from ..schemas.common import LatLng
from ..services import farm as svc

router = APIRouter(tags=["farm"])

CropQ = Query(min_length=2, max_length=12)
StageQ = Query(min_length=2, max_length=12)


class FieldIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    crop: str = Field(max_length=12)
    stage: str = Field(max_length=12)
    location: LatLng
    area: float | None = Field(default=None, ge=0, le=100000)
    client_id: str | None = Field(default=None, max_length=64)


class FieldPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    crop: str | None = Field(default=None, max_length=12)
    stage: str | None = Field(default=None, max_length=12)
    location: LatLng | None = None
    area: float | None = Field(default=None, ge=0, le=100000)


class DoneIn(BaseModel):
    field_id: uuid.UUID | None = None


@router.get("/farm/fields", operation_id="farm_fields")
async def fields(db: DB, viewer: ViewerDep) -> list[dict]:
    if viewer.user is None or viewer.is_guest:
        return []
    rows = (
        (await db.execute(select(FarmField).where(FarmField.user_id == viewer.user.id).order_by(FarmField.created_at)))
        .scalars()
        .all()
    )
    return [svc.field_out(f) for f in rows]


@router.post("/farm/fields", operation_id="farm_fields_add")
async def add_field(body: FieldIn, db: DB, user: FullUser) -> dict:
    f = await svc.add_field(
        db,
        user,
        name=body.name,
        crop=body.crop,
        stage=body.stage,
        lat=body.location.lat,
        lng=body.location.lng,
        area=body.area,
        client_id=body.client_id,
    )
    return svc.field_out(f)


@router.patch("/farm/fields/{field_id}", operation_id="farm_fields_patch")
async def patch_field(field_id: uuid.UUID, body: FieldPatch, db: DB, user: FullUser) -> dict:
    f = await svc.get_field(db, user, field_id)
    f = await svc.patch_field(db, f, body.model_dump(exclude_unset=True))
    return svc.field_out(f)


@router.delete("/farm/fields/{field_id}", operation_id="farm_fields_delete", status_code=204)
async def delete_field(field_id: uuid.UUID, db: DB, user: FullUser) -> None:
    f = await svc.get_field(db, user, field_id)
    await db.delete(f)
    await db.commit()


async def _where(
    db: DB,
    viewer: ViewerDep,
    field_id: uuid.UUID | None,
    lat: float | None,
    lng: float | None,
    crop: str | None,
    stage: str | None,
):
    if field_id is not None:
        if viewer.user is None or viewer.is_guest:
            raise AppError(403, "auth.guest_restricted", "Create a free account to save fields")
        f = await svc.get_field(db, viewer.user, field_id)
        return f.lat, f.lng, f.crop, f.stage
    if lat is None or lng is None or not crop or not stage:
        raise AppError(400, "farm.where", "Send field_id, or lat, lng, crop and stage")
    return lat, lng, crop, stage


@router.get("/farm/alerts", operation_id="farm_alerts")
async def alerts(
    db: DB,
    viewer: ViewerDep,
    field_id: uuid.UUID | None = None,
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    crop: str | None = Query(None, max_length=12),
    stage: str | None = Query(None, max_length=12),
) -> dict:
    """Guests may ask by place, crop and stage; saved fields need an account (A7)."""
    la, lo, cr, st = await _where(db, viewer, field_id, lat, lng, crop, stage)
    user = viewer.user if viewer.user is not None and not viewer.is_guest else None
    return await svc.alerts(db, la, lo, cr, st, user=user, field_id=field_id)


@router.get("/farm/alerts/{alert_id}", operation_id="farm_alert")
async def alert(
    alert_id: str,
    db: DB,
    viewer: ViewerDep,
    field_id: uuid.UUID | None = None,
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    crop: str | None = Query(None, max_length=12),
    stage: str | None = Query(None, max_length=12),
) -> dict:
    la, lo, cr, st = await _where(db, viewer, field_id, lat, lng, crop, stage)
    user = viewer.user if viewer.user is not None and not viewer.is_guest else None
    return await svc.alert_by_id(db, alert_id, la, lo, cr, st, user)


@router.post("/farm/alerts/{alert_id}/done", operation_id="farm_alert_done", status_code=204)
async def done(alert_id: str, body: DoneIn, db: DB, user: FullUser) -> None:
    """'I've done it': stored per person and alert."""
    if len(alert_id) > 120:
        raise AppError(400, "farm.alert_id", "Not a valid alert")
    await svc.mark_done(db, user, alert_id, body.field_id)
