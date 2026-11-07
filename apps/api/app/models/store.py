"""Points store and sapling marketplace (§6.9)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import fk_uuid, now_col, now_upd, point_col, uuid_pk


class Partner(Base):
    __tablename__ = "partners"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    company_id: Mapped[uuid.UUID | None] = fk_uuid("companies.id", nullable=True, ondelete="SET NULL")
    logo_url: Mapped[str | None] = mapped_column(Text)
    logo_emoji: Mapped[str | None] = mapped_column(String(8))
    csr_line: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(10), default="active", nullable=False)
    is_pilot: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    listing_fee_bdt: Mapped[float | None] = mapped_column(Float)
    fee_per_tree_bdt: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = now_col()


class PartnerOutlet(Base):
    __tablename__ = "partner_outlets"
    id: Mapped[uuid.UUID] = uuid_pk()
    partner_id: Mapped[uuid.UUID] = fk_uuid("partners.id")
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str | None] = mapped_column(String(300))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)


class PartnerMember(Base):
    __tablename__ = "partner_members"
    partner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partners.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(8), default="staff", nullable=False)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[uuid.UUID] = uuid_pk()
    partner_id: Mapped[uuid.UUID] = fk_uuid("partners.id")
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000))
    category: Mapped[str] = mapped_column(String(10), nullable=False)  # food|home|garden|vouchers
    photo_url: Mapped[str | None] = mapped_column(Text)
    emoji: Mapped[str | None] = mapped_column(String(8))
    points_price: Mapped[int] = mapped_column(Integer, nullable=False)
    declared_value_bdt: Mapped[float] = mapped_column(Float, nullable=False)
    stock: Mapped[int] = mapped_column(Integer, nullable=False)
    fulfilment: Mapped[str] = mapped_column(String(10), nullable=False)  # pickup | delivery
    delivery_area: Mapped[str | None] = mapped_column(String(200))
    terms: Mapped[str | None] = mapped_column(String(1000))
    monthly_limit: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = now_upd()

    __table_args__ = (
        CheckConstraint("stock >= 0", name="stock_nonneg"),
        CheckConstraint("points_price > 0", name="price_pos"),
        CheckConstraint("category in ('food','home','garden','vouchers')", name="category"),
    )


class Redemption(Base):
    __tablename__ = "redemptions"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    product_id: Mapped[uuid.UUID] = fk_uuid("products.id", ondelete="RESTRICT")
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(10), default="issued", nullable=False
    )  # issued|collected|expired|cancelled
    delivery_address: Mapped[str | None] = mapped_column(String(500))
    device_id: Mapped[str | None] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = now_col()
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Voucher(Base):
    __tablename__ = "vouchers"
    id: Mapped[uuid.UUID] = uuid_pk()
    redemption_id: Mapped[uuid.UUID] = fk_uuid("redemptions.id")
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    collected_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    outlet_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class NurseryPartner(Base):
    __tablename__ = "nursery_partners"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str | None] = mapped_column(String(300))
    phone: Mapped[str | None] = mapped_column(String(24))
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    geom = point_col()
    commission_pct: Mapped[float] = mapped_column(Float, default=10.0, nullable=False)
    status: Mapped[str] = mapped_column(String(10), default="active", nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = now_col()


class NurseryProduct(Base):
    __tablename__ = "nursery_products"
    id: Mapped[uuid.UUID] = uuid_pk()
    nursery_id: Mapped[uuid.UUID] = fk_uuid("nursery_partners.id")
    species_id: Mapped[str | None] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(8), default="sapling", nullable=False)  # sapling | kit
    price_bdt: Mapped[float] = mapped_column(Float, nullable=False)
    stock: Mapped[int] = mapped_column(Integer, nullable=False)
    photo_url: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (CheckConstraint("stock >= 0", name="stock_nonneg"),)


class SaplingOrder(Base):
    __tablename__ = "sapling_orders"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk_uuid("users.id")
    nursery_product_id: Mapped[uuid.UUID] = fk_uuid("nursery_products.id", ondelete="RESTRICT")
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_bdt: Mapped[float] = mapped_column(Float, nullable=False)
    commission_bdt: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(10), default="unpaid", nullable=False)
    tran_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    delivery_address: Mapped[str | None] = mapped_column(String(500))
    meta: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = now_col()
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
