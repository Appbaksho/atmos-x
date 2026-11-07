"""Heat: regions, composites, per-hex cells, coefficients, scans and their immutable zones (§7.1–§7.4)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import now_col, uuid_pk


class PrecomputeRegion(Base):
    __tablename__ = "precompute_regions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    south: Mapped[float] = mapped_column(Float, nullable=False)
    west: Mapped[float] = mapped_column(Float, nullable=False)
    north: Mapped[float] = mapped_column(Float, nullable=False)
    east: Mapped[float] = mapped_column(Float, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[str | None] = mapped_column(Text)


class Composite(Base):
    """One run of the heat pipeline over an area: which scenes, dates and baseline produced the cells."""

    __tablename__ = "composites"
    id: Mapped[uuid.UUID] = uuid_pk()
    area_kind: Mapped[str] = mapped_column(String(16), nullable=False)  # region | chunk
    area_key: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    pipeline_version: Mapped[str] = mapped_column(String(20), nullable=False)
    method: Mapped[str] = mapped_column(String(16), nullable=False)  # landsat | modis | landcover
    lst_from: Mapped[date | None] = mapped_column(Date)
    lst_to: Mapped[date | None] = mapped_column(Date)
    lst_scenes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    window_days: Mapped[int | None] = mapped_column(Integer)
    ndvi_date: Mapped[date | None] = mapped_column(Date)
    worldcover_year: Mapped[int | None] = mapped_column(Integer)
    ecostress_passes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    night_source: Mapped[str | None] = mapped_column(String(24))
    night_from: Mapped[date | None] = mapped_column(Date)
    night_to: Mapped[date | None] = mapped_column(Date)
    baseline_lst_c: Mapped[float | None] = mapped_column(Float)
    cell_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    satellite_cells: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stats: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = now_col()


class HeatCell(Base):
    """Latest values per H3 res-10 hex. Scores do not depend on any scan (§7.2)."""

    __tablename__ = "heat_cells"
    h3: Mapped[str] = mapped_column(String(16), primary_key=True)
    chunk: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    composite_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("composites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    label: Mapped[str] = mapped_column(String(12), nullable=False)  # satellite | estimate | no_data
    score: Mapped[int | None] = mapped_column(Integer)
    lst_c: Mapped[float | None] = mapped_column(Float)
    anom_day: Mapped[float | None] = mapped_column(Float)
    landsat_anom: Mapped[float | None] = mapped_column(Float)
    eco_anom: Mapped[float | None] = mapped_column(Float)
    night_lst_c: Mapped[float | None] = mapped_column(Float)
    anom_night: Mapped[float | None] = mapped_column(Float)
    sealed: Mapped[float | None] = mapped_column(Float)
    green: Mapped[float | None] = mapped_column(Float)
    water: Mapped[float | None] = mapped_column(Float)
    tree: Mapped[float | None] = mapped_column(Float)
    ndvi: Mapped[float | None] = mapped_column(Float)
    dark_surface: Mapped[float | None] = mapped_column(Float)
    pop_density_km2: Mapped[float | None] = mapped_column(Float)
    building_share: Mapped[float | None] = mapped_column(Float)
    road_share: Mapped[float | None] = mapped_column(Float)
    buildings_per_ha: Mapped[float | None] = mapped_column(Float)
    valid_px: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    n_obs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    terms: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    updated_at: Mapped[datetime] = now_col()


class DriverCoefficients(Base):
    __tablename__ = "driver_coefficients"
    id: Mapped[uuid.UUID] = uuid_pk()
    area_key: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    composite_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    coefs: Mapped[dict] = mapped_column(JSONB, nullable=False)
    means: Mapped[dict] = mapped_column(JSONB, nullable=False)
    r2: Mapped[float | None] = mapped_column(Float)
    n: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(12), nullable=False)  # derived | estimate
    created_at: Mapped[datetime] = now_col()


class Scan(Base):
    __tablename__ = "scans"
    id: Mapped[uuid.UUID] = uuid_pk()
    center_cell: Mapped[str] = mapped_column(String(16), nullable=False)
    k: Mapped[int] = mapped_column(Integer, nullable=False)
    radius_m: Mapped[int] = mapped_column(Integer, nullable=False)
    composite_key: Mapped[str] = mapped_column(String(64), nullable=False)
    pipeline_version: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False)
    center_lat: Mapped[float] = mapped_column(Float, nullable=False)
    center_lng: Mapped[float] = mapped_column(Float, nullable=False)
    place: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)  # {lang: label}
    acquired: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    baseline_lst_c: Mapped[float | None] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(16), nullable=False)
    hexes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    sources: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    job_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = now_col()
    last_used_at: Mapped[datetime] = now_col()

    __table_args__ = (UniqueConstraint("center_cell", "k", "composite_key"),)


class ScanZone(Base):
    """Immutable zone row. `id` = z_<8 hex of scan id>_<rank>; never recomputed (§7.3)."""

    __tablename__ = "scan_zones"
    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    scan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[dict] = mapped_column(JSONB, nullable=False)  # {lang: name} or {"code": ...}
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    lst_c: Mapped[float | None] = mapped_column(Float)
    label: Mapped[str] = mapped_column(String(12), nullable=False)
    dist_m: Mapped[int] = mapped_column(Integer, nullable=False)
    near_tie: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    centroid_lat: Mapped[float] = mapped_column(Float, nullable=False)
    centroid_lng: Mapped[float] = mapped_column(Float, nullable=False)
    h3: Mapped[list[str]] = mapped_column(ARRAY(String(16)), nullable=False)
    chunk: Mapped[str] = mapped_column(String(16), nullable=False)
    drivers: Mapped[dict] = mapped_column(JSONB, nullable=False)
    causes: Mapped[list] = mapped_column(JSONB, nullable=False)
    why: Mapped[list] = mapped_column(JSONB, nullable=False)
    what_if: Mapped[dict] = mapped_column(JSONB, nullable=False)
    area_km2: Mapped[float] = mapped_column(Float, nullable=False)
    stats: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = now_col()


class ZoneHistory(Base):
    __tablename__ = "zone_history"
    chunk: Mapped[str] = mapped_column(String(16), primary_key=True)
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    day_lst_c: Mapped[float | None] = mapped_column(Float)
    night_lst_c: Mapped[float | None] = mapped_column(Float)
    months: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    n_composites: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    source: Mapped[str] = mapped_column(String(24), nullable=False)
    created_at: Mapped[datetime] = now_col()


class PlaceLabel(Base):
    __tablename__ = "place_labels"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)  # h3 res-9 cell
    lang: Mapped[str] = mapped_column(String(5), primary_key=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    city: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(120))
    country_code: Mapped[str | None] = mapped_column(String(2))
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    fetched_at: Mapped[datetime] = now_col()


class Job(Base):
    """Queue (§3.1): claimed with FOR UPDATE SKIP LOCKED, deduplicated by (kind, key) while active."""

    __tablename__ = "jobs"
    id: Mapped[uuid.UUID] = uuid_pk()
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="queued", nullable=False, index=True)
    priority: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    run_after: Mapped[datetime] = now_col()
    progress: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_cells: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    done_cells: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    result: Mapped[dict | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = now_col()
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DataCache(Base):
    __tablename__ = "data_cache"
    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    value: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    as_of: Mapped[str | None] = mapped_column(String(40))
    fetched_at: Mapped[datetime] = now_col()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UsageCounter(Base):
    __tablename__ = "usage_counters"
    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[uuid.UUID] = uuid_pk()
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[str | None] = mapped_column(String(64))
    data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = now_col()


class AskMessage(Base):
    """Ask Atmos log (§6.12 K8). No precise location; message text kept only when unanswered."""

    __tablename__ = "ask_messages"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    intent: Mapped[str] = mapped_column(String(24), nullable=False)
    screen: Mapped[str | None] = mapped_column(String(8))
    lang: Mapped[str] = mapped_column(String(5), nullable=False)
    answered: Mapped[bool] = mapped_column(Boolean, nullable=False)
    unanswered_text: Mapped[str | None] = mapped_column(String(500))
    helpful: Mapped[bool | None] = mapped_column(Boolean)
    ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = now_col()
