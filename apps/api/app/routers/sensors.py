"""Your own PM2.5 sensor (prompt-v1 §7.8, E15): real ingest only, no simulation."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..config import settings
from ..deps import DB, FullUser, SessionUser
from ..errors import AppError, not_found
from ..models import Sensor, SensorReading
from ..security import hash_token
from ..services.air import SENSOR_OFFLINE

router = APIRouter(tags=["sensors"])


class SensorIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    model: str | None = Field(default=None, max_length=80)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class ReadingIn(BaseModel):
    pm25: float = Field(ge=0, le=1000)
    pm10: float | None = Field(default=None, ge=0, le=2000)
    temp_c: float | None = Field(default=None, ge=-40, le=70)
    rh: float | None = Field(default=None, ge=0, le=100)
    taken_at: datetime | None = None


def out(s: Sensor) -> dict:
    now = datetime.now(UTC)
    return {
        "id": str(s.id),
        "name": s.name,
        "model": s.model,
        "location": {"lat": s.lat, "lng": s.lng} if s.lat is not None and s.lng is not None else None,
        "pm25": s.last_pm25,
        "last_seen": s.last_seen_at.isoformat() if s.last_seen_at else None,
        "online": bool(s.last_seen_at and now - s.last_seen_at <= SENSOR_OFFLINE),
        "created_at": s.created_at.isoformat(),
    }


@router.get("/sensors/mine", operation_id="sensors_mine")
async def mine(db: DB, user: SessionUser) -> list[dict]:
    if user.role == "guest":
        return []
    rows = (
        (await db.execute(select(Sensor).where(Sensor.user_id == user.id).order_by(Sensor.created_at))).scalars().all()
    )
    return [out(s) for s in rows]


@router.post("/sensors", operation_id="sensors_add")
async def add(body: SensorIn, db: DB, user: FullUser) -> dict:
    count = len((await db.execute(select(Sensor.id).where(Sensor.user_id == user.id))).all())
    if count >= 10:
        raise AppError(400, "sensor.limit", "You can add up to 10 sensors")
    token = "atx_" + secrets.token_urlsafe(24)
    s = Sensor(
        user_id=user.id,
        name=body.name.strip(),
        model=body.model,
        lat=body.lat,
        lng=body.lng,
        token_hash=hash_token(token),
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return {**out(s), "token": token, "ingest_url": f"{settings.public_web_origin}/api/v1/sensors/ingest"}


@router.delete("/sensors/{sensor_id}", operation_id="sensors_delete")
async def delete(sensor_id: uuid.UUID, db: DB, user: FullUser) -> dict:
    s = await db.get(Sensor, sensor_id)
    if s is None or s.user_id != user.id:
        raise not_found("sensor.not_found", "Sensor not found")
    await db.delete(s)
    await db.commit()
    return {"ok": True}


@router.post("/sensors/ingest", operation_id="sensors_ingest")
async def ingest(body: ReadingIn, db: DB, x_sensor_token: str = Header(default="")) -> dict:
    if not x_sensor_token:
        raise AppError(401, "sensor.token_missing", "Send the X-Sensor-Token header")
    s = (await db.execute(select(Sensor).where(Sensor.token_hash == hash_token(x_sensor_token)))).scalar_one_or_none()
    if s is None:
        raise AppError(401, "sensor.token_invalid", "Unknown sensor token")
    now = datetime.now(UTC)
    if s.last_seen_at and now - s.last_seen_at < timedelta(seconds=60):
        raise AppError(
            429,
            "sensor.too_fast",
            "One reading per minute",
            retry_after=60 - int((now - s.last_seen_at).total_seconds()),
        )
    taken = body.taken_at or now
    if taken.tzinfo is None:
        taken = taken.replace(tzinfo=UTC)
    if taken > now + timedelta(minutes=10) or taken < now - timedelta(days=1):
        raise AppError(400, "sensor.bad_time", "taken_at must be within the last day")
    db.add(
        SensorReading(sensor_id=s.id, pm25=body.pm25, pm10=body.pm10, temp_c=body.temp_c, rh=body.rh, taken_at=taken)
    )
    s.last_seen_at = now
    s.last_pm25 = round(body.pm25, 1)
    await db.commit()
    return {"ok": True, "sensor_id": str(s.id)}
