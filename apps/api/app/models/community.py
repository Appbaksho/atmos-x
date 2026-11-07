"""Teams, orgs, feed, events, reports, moderation, notifications, push (§6.8)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import fk_uuid, now_col, point_col, uuid_pk

MAX_TEAM_MEMBERS = 5


class Org(Base):
    __tablename__ = "orgs"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(12), nullable=False)  # school | ngo | city | company | other
    city: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(2))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    logo_photo_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    logo_emoji: Mapped[str | None] = mapped_column(String(8))
    created_by: Mapped[uuid.UUID | None] = fk_uuid("users.id", nullable=True, ondelete="SET NULL")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = now_col()


class OrgMember(Base):
    __tablename__ = "org_members"
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orgs.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(8), default="member", nullable=False)
    joined_at: Mapped[datetime] = now_col()


class Team(Base):
    __tablename__ = "teams"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    code: Mapped[str] = mapped_column(String(12), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    org_id: Mapped[uuid.UUID | None] = fk_uuid("orgs.id", nullable=True, ondelete="SET NULL")
    owner_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    max_members: Mapped[int] = mapped_column(Integer, default=MAX_TEAM_MEMBERS, nullable=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    area: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(2))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    geom = point_col()
    emoji: Mapped[str | None] = mapped_column(String(8))
    goal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = now_col()

    __table_args__ = (CheckConstraint(f"max_members between 2 and {MAX_TEAM_MEMBERS}", name="max_members"),)


class TeamMember(Base):
    __tablename__ = "team_members"
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[str] = mapped_column(String(8), default="member", nullable=False)  # lead | member
    joined_at: Mapped[datetime] = now_col()

    __table_args__ = (CheckConstraint("role in ('lead','member')", name="role"),)


class TeamMessage(Base):
    __tablename__ = "team_messages"
    id: Mapped[uuid.UUID] = uuid_pk()
    team_id: Mapped[uuid.UUID] = fk_uuid("teams.id")
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    body: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class Post(Base):
    __tablename__ = "posts"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    body: Mapped[str] = mapped_column(String(2000), default="", nullable=False)
    photo_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    action_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    tree_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    team_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    event_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    area: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(2))
    geom = point_col()  # rounded to about 1 km: area only, never a precise location
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class PostLike(Base):
    __tablename__ = "post_likes"
    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = now_col()


class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[uuid.UUID] = uuid_pk()
    post_id: Mapped[uuid.UUID] = fk_uuid("posts.id")
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    body: Mapped[str] = mapped_column(String(1000), nullable=False)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = now_col()


class Mention(Base):
    __tablename__ = "mentions"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    post_id: Mapped[uuid.UUID | None] = fk_uuid("posts.id", nullable=True)
    comment_id: Mapped[uuid.UUID | None] = fk_uuid("comments.id", nullable=True)
    created_at: Mapped[datetime] = now_col()


class Event(Base):
    __tablename__ = "events"
    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2000))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    place_name: Mapped[str] = mapped_column(String(200), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    geom = point_col()
    organizer_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    team_id: Mapped[uuid.UUID | None] = fk_uuid("teams.id", nullable=True, ondelete="SET NULL")
    org_id: Mapped[uuid.UUID | None] = fk_uuid("orgs.id", nullable=True, ondelete="SET NULL")
    sponsor_name: Mapped[str | None] = mapped_column(String(120))
    sponsor_logo_photo_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    group_photo_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    capacity: Mapped[int | None] = mapped_column(Integer)
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = now_col()


class EventRsvp(Base):
    __tablename__ = "event_rsvps"
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(8), default="going", nullable=False)
    created_at: Mapped[datetime] = now_col()


class EventCheckin(Base):
    __tablename__ = "event_checkins"
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    dist_m: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = now_col()


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[uuid.UUID] = uuid_pk()
    reporter_id: Mapped[uuid.UUID | None] = fk_uuid("users.id", nullable=True, ondelete="SET NULL")
    target_type: Mapped[str] = mapped_column(String(12), nullable=False)  # post|comment|photo|user|action|tree
    target_id: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(String(24), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(10), default="open", nullable=False, index=True)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = now_col()


class ModerationAction(Base):
    __tablename__ = "moderation_actions"
    id: Mapped[uuid.UUID] = uuid_pk()
    moderator_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    target_type: Mapped[str] = mapped_column(String(12), nullable=False)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(12), nullable=False)  # hide|restore|approve|reject|warn|block|unblock
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = now_col()


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[dict] = mapped_column(JSONB, nullable=False)
    body: Mapped[dict | None] = mapped_column(JSONB)
    screen: Mapped[str | None] = mapped_column(String(8))
    params: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dedupe_key: Mapped[str | None] = mapped_column(String(160))
    pushed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now_col()

    __table_args__ = (UniqueConstraint("user_id", "dedupe_key"),)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    tz_offset_min: Mapped[int] = mapped_column(Integer, default=360, nullable=False)
    created_at: Mapped[datetime] = now_col()
