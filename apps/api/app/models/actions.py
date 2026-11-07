"""Action types, actions, reviews, photos, trees, tree checks (§6.7, §7.11, §7.12)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import fk_uuid, now_col, point_col, uuid_pk


class ActionType(Base):
    __tablename__ = "action_types"
    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    title_code: Mapped[str] = mapped_column(String(60), nullable=False)
    unit_code: Mapped[str] = mapped_column(String(60), nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    points_per: Mapped[float] = mapped_column(Float, default=1, nullable=False)  # e.g. 100 for 30 per 100 m²
    cooling_per_unit: Mapped[float] = mapped_column(Float, nullable=False)
    cooling_unit_size: Mapped[float] = mapped_column(Float, default=1, nullable=False)
    is_tree: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_ground: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    content_check: Mapped[str] = mapped_column(String(12), default="green", nullable=False)  # green | roof | none
    emoji: Mapped[str | None] = mapped_column(String(8))
    daily_limit: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Photo(Base):
    __tablename__ = "photos"
    id: Mapped[uuid.UUID] = uuid_pk()
    owner_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    purpose: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # action|tree_check|avatar|post|event|company_doc|product|logo
    path_original: Mapped[str] = mapped_column(Text, nullable=False)
    path_public: Mapped[str | None] = mapped_column(Text)
    path_thumb: Mapped[str | None] = mapped_column(Text)
    mime: Mapped[str] = mapped_column(String(40), nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    phash: Mapped[str | None] = mapped_column(String(32), index=True)
    exif_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exif_lat: Mapped[float | None] = mapped_column(Float)
    exif_lng: Mapped[float | None] = mapped_column(Float)
    green_share: Mapped[float | None] = mapped_column(Float)
    bright_share: Mapped[float | None] = mapped_column(Float)
    moderation: Mapped[str] = mapped_column(String(10), default="pending", nullable=False, index=True)
    moderation_reason: Mapped[str | None] = mapped_column(String(80))
    private: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = now_col()


class Action(Base):
    __tablename__ = "actions"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    action_type: Mapped[str] = mapped_column(String(24), ForeignKey("action_types.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    accuracy_m: Mapped[float | None] = mapped_column(Float)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    capture_source: Mapped[str] = mapped_column(String(12), default="upload", nullable=False)  # camera | upload
    photo_id: Mapped[uuid.UUID | None] = fk_uuid("photos.id", nullable=True, ondelete="SET NULL")
    goal_id: Mapped[uuid.UUID | None] = fk_uuid("goals.id", nullable=True, ondelete="SET NULL")
    team_id: Mapped[uuid.UUID | None] = fk_uuid("teams.id", nullable=True, ondelete="SET NULL")
    species_id: Mapped[str | None] = mapped_column(String(40))
    nickname: Mapped[str | None] = mapped_column(String(60))
    note: Mapped[str | None] = mapped_column(String(500))
    zone_label: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(10), default="pending", nullable=False, index=True)
    checks: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    reason_code: Mapped[str | None] = mapped_column(String(60))
    points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cooling_c: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(64))
    client_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = now_col()
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint("user_id", "client_id"),)


class ActionReview(Base):
    __tablename__ = "action_reviews"
    id: Mapped[uuid.UUID] = uuid_pk()
    action_id: Mapped[uuid.UUID] = fk_uuid("actions.id")
    reviewer_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    approve: Mapped[bool] = mapped_column(Boolean, nullable=False)
    note: Mapped[str | None] = mapped_column(String(280))
    created_at: Mapped[datetime] = now_col()

    __table_args__ = (UniqueConstraint("action_id", "reviewer_id"),)


class Tree(Base):
    __tablename__ = "trees"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    action_id: Mapped[uuid.UUID | None] = fk_uuid("actions.id", nullable=True, ondelete="SET NULL")
    team_id: Mapped[uuid.UUID | None] = fk_uuid("teams.id", nullable=True, ondelete="SET NULL")
    species_id: Mapped[str] = mapped_column(String(40), nullable=False)
    nickname: Mapped[str] = mapped_column(String(60), nullable=False)
    planted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    geom = point_col()
    photo_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    last_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    lost_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    milestones: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)  # {"d90": iso, "y1": iso}
    client_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = now_col()


class TreeCheck(Base):
    __tablename__ = "tree_checks"
    id: Mapped[uuid.UUID] = uuid_pk()
    tree_id: Mapped[uuid.UUID] = fk_uuid("trees.id")
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    photo_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    health: Mapped[str] = mapped_column(String(10), nullable=False)
    height_cm: Mapped[float | None] = mapped_column(Float)
    note: Mapped[str | None] = mapped_column(String(500))
    checks: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    on_time: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tip: Mapped[dict | None] = mapped_column(JSONB)
    client_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = now_col()
