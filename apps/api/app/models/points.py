"""Points ledger, rules and badges (§6.7 PT8–PT11)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import fk_uuid, now_col, uuid_pk  # noqa: F401

LEDGER_STATES = ("pending", "spendable", "spent", "revoked")
LEDGER_KINDS = ("earn", "unlock", "spend", "refund", "revoke")


class PointRule(Base):
    __tablename__ = "point_rules"
    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    per: Mapped[str] = mapped_column(String(24), nullable=False)
    unlock: Mapped[str] = mapped_column(String(24), nullable=False)  # tree_90d | verified_90d | immediate


class PointsLedger(Base):
    """Append-only. A state change is a pair of rows (−amount old state, +amount new state)."""

    __tablename__ = "points_ledger"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(String(10), nullable=False)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    rule_id: Mapped[str | None] = mapped_column(String(24), ForeignKey("point_rules.id"))
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    tree_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    earn_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    unlock_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now_col()

    __table_args__ = (
        CheckConstraint(f"state in {LEDGER_STATES}", name="state"),
        CheckConstraint(f"kind in {LEDGER_KINDS}", name="kind"),
    )


class Badge(Base):
    __tablename__ = "badges"
    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    emoji: Mapped[str] = mapped_column(String(8), nullable=False)
    code: Mapped[str] = mapped_column(String(60), nullable=False)
    rule: Mapped[dict] = mapped_column(JSONB, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class UserBadge(Base):
    __tablename__ = "user_badges"
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    badge_id: Mapped[str] = mapped_column(String(24), ForeignKey("badges.id"), primary_key=True)
    earned_at: Mapped[datetime] = now_col()
    source: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
