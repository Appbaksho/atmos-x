"""Identity: users, auth identities, OTP challenges, profiles, follows, blocks (prompt-v1 §6.2, §6.8)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import fk_uuid, now_col, now_upd, point_col, uuid_pk

ROLES = ("guest", "user", "moderator", "admin")


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = uuid_pk()
    role: Mapped[str] = mapped_column(String(16), default="user", nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True)
    password_hash: Mapped[str | None] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    avatar_photo_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    session_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = now_col()
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (CheckConstraint(f"role in {ROLES}", name="role"),)


class AuthIdentity(Base):
    __tablename__ = "auth_identities"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    provider_subject: Mapped[str] = mapped_column(String(320), nullable=False)
    created_at: Mapped[datetime] = now_col()

    __table_args__ = (
        UniqueConstraint("provider", "provider_subject"),
        CheckConstraint("provider in ('password','google','phone')", name="provider"),
    )


class OtpChallenge(Base):
    __tablename__ = "otp_challenges"
    id: Mapped[uuid.UUID] = uuid_pk()
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider: Mapped[str] = mapped_column(String(16), nullable=False, default="console")
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = now_col()


class Profile(Base):
    __tablename__ = "profiles"
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    bio: Mapped[str | None] = mapped_column(String(280))
    area: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str | None] = mapped_column(String(120))
    country_code: Mapped[str | None] = mapped_column(String(2))
    home_lat: Mapped[float | None] = mapped_column(Float)
    home_lng: Mapped[float | None] = mapped_column(Float)
    home_geom = point_col()
    radius_m: Mapped[int] = mapped_column(Integer, default=200, nullable=False)
    lang: Mapped[str] = mapped_column(String(5), default="en", nullable=False)
    unit: Mapped[str] = mapped_column(String(1), default="C", nullable=False)
    area_unit: Mapped[str] = mapped_column(String(8), default="metric", nullable=False)
    theme: Mapped[str] = mapped_column(String(8), default="system", nullable=False)
    farmer_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ask_on: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    push_on: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    imported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = now_upd()


class Follow(Base):
    __tablename__ = "follows"
    id: Mapped[uuid.UUID] = uuid_pk()
    follower_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    user_id: Mapped[uuid.UUID | None] = fk_uuid("users.id", nullable=True)
    team_id: Mapped[uuid.UUID | None] = fk_uuid("teams.id", nullable=True)
    created_at: Mapped[datetime] = now_col()

    __table_args__ = (
        UniqueConstraint("follower_id", "user_id", "team_id"),
        CheckConstraint("(user_id is null) <> (team_id is null)", name="one_target"),
    )


class Block(Base):
    __tablename__ = "blocks"
    blocker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    blocked_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = now_col()
