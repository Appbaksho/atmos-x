"""Goals, tasks, drafts, species, cost tables, planting spots (§6.6, §7.10)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import fk_uuid, now_col, now_upd, uuid_pk


class Goal(Base):
    __tablename__ = "goals"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    team_id: Mapped[uuid.UUID | None] = fk_uuid("teams.id", nullable=True, ondelete="SET NULL")
    org_id: Mapped[uuid.UUID | None] = fk_uuid("orgs.id", nullable=True, ondelete="SET NULL")
    zone_id: Mapped[str] = mapped_column(
        String(24), ForeignKey("scan_zones.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    zone_name: Mapped[str] = mapped_column(String(200), nullable=False)
    zone_lat: Mapped[float] = mapped_column(Float, nullable=False)
    zone_lng: Mapped[float] = mapped_column(Float, nullable=False)
    target_c: Mapped[float] = mapped_column(Float, nullable=False)
    by_date: Mapped[date] = mapped_column(Date, nullable=False)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)  # action | cooling
    targets: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)  # {trees, roof_m2, shade}
    status: Mapped[str] = mapped_column(String(12), default="active", nullable=False)
    reached_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    client_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = now_upd()


class GoalTask(Base):
    __tablename__ = "goal_tasks"
    id: Mapped[uuid.UUID] = uuid_pk()
    goal_id: Mapped[uuid.UUID] = fk_uuid("goals.id")
    title: Mapped[dict] = mapped_column(JSONB, nullable=False)  # I18nText
    action_type: Mapped[str | None] = mapped_column(String(24))
    qty: Mapped[float | None] = mapped_column(Float)
    owner_id: Mapped[uuid.UUID | None] = fk_uuid("users.id", nullable=True, ondelete="SET NULL")
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(8), default="todo", nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = now_col()


class GoalDraft(Base):
    __tablename__ = "goal_drafts"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = now_col()


class Species(Base):
    __tablename__ = "species"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[dict] = mapped_column(JSONB, nullable=False)  # {lang: name}
    local_name: Mapped[str | None] = mapped_column(String(80))
    scientific: Mapped[str] = mapped_column(String(120), nullable=False)
    emoji: Mapped[str | None] = mapped_column(String(8))
    kind: Mapped[str] = mapped_column(String(12), default="tree", nullable=False)
    canopy_m: Mapped[float] = mapped_column(Float, nullable=False)
    cooling: Mapped[str] = mapped_column(String(8), nullable=False)
    water: Mapped[str] = mapped_column(String(8), nullable=False)
    price_amount: Mapped[float | None] = mapped_column(Float)
    price_currency: Mapped[str | None] = mapped_column(String(3))
    planting_season: Mapped[str] = mapped_column(String(40), nullable=False)
    growth: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)  # I18nText codes
    native_regions: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    countries: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)  # ['BD'] or []
    climate_bands: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="reference")
    estimate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class CostTable(Base):
    __tablename__ = "cost_tables"
    country: Mapped[str] = mapped_column(String(8), primary_key=True)  # 'BD' | 'default'
    item: Mapped[str] = mapped_column(String(24), primary_key=True)
    unit_cost: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    updated_at: Mapped[datetime] = now_upd()


class PlantingSpots(Base):
    __tablename__ = "planting_spots"
    zone_id: Mapped[str] = mapped_column(String(24), ForeignKey("scan_zones.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False)  # ready | pending | failed
    features: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    totals: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    zone_area_m2: Mapped[float | None] = mapped_column(Float)
    error: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[datetime] = now_col()
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
