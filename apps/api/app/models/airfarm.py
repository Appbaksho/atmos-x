"""Sensors, readings, farm fields and alert acknowledgements (§7.8, §7.9)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import fk_uuid, now_col, uuid_pk


class Sensor(Base):
    __tablename__ = "sensors"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    model: Mapped[str | None] = mapped_column(String(80))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_pm25: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = now_col()


class SensorReading(Base):
    __tablename__ = "sensor_readings"
    id: Mapped[uuid.UUID] = uuid_pk()
    sensor_id: Mapped[uuid.UUID] = fk_uuid("sensors.id")
    pm25: Mapped[float] = mapped_column(Float, nullable=False)
    pm10: Mapped[float | None] = mapped_column(Float)
    temp_c: Mapped[float | None] = mapped_column(Float)
    rh: Mapped[float | None] = mapped_column(Float)
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = now_col()


class FarmField(Base):
    __tablename__ = "farm_fields"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    crop: Mapped[str] = mapped_column(String(12), nullable=False)
    stage: Mapped[str] = mapped_column(String(12), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    area: Mapped[float | None] = mapped_column(Float)
    client_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = now_col()


class AlertAcknowledgement(Base):
    __tablename__ = "alert_acknowledgements"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    alert_id: Mapped[str] = mapped_column(String(120), nullable=False)
    field_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("farm_fields.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = now_col()

    __table_args__ = (UniqueConstraint("user_id", "alert_id"),)
