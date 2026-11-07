"""Company marketplace: accounts, packages, payments, invoices, payouts, credit lots (§6.10)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import fk_uuid, now_col, uuid_pk

LOT_STATES = ("estimated", "verified", "sold", "retired")


class Company(Base):
    __tablename__ = "companies"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    trade_licence: Mapped[str] = mapped_column(String(80), nullable=False)
    tin_bin: Mapped[str] = mapped_column(String(40), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(120), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(320), nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(24))
    industry: Mapped[str] = mapped_column(String(60), nullable=False)
    logo_photo_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(10), default="pending", nullable=False)  # pending|approved|rejected
    review_note: Mapped[str | None] = mapped_column(String(500))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = now_col()


class CompanyDocument(Base):
    __tablename__ = "company_documents"
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = fk_uuid("companies.id")
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # trade_licence | tin_bin | other
    path: Mapped[str] = mapped_column(Text, nullable=False)
    mime: Mapped[str] = mapped_column(String(60), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = now_col()


class CompanyMember(Base):
    __tablename__ = "company_members"
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[str] = mapped_column(String(8), default="admin", nullable=False)


class EmissionsProfile(Base):
    __tablename__ = "emissions_profiles"
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True
    )
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    tonnes_co2e: Mapped[float] = mapped_column(Float, nullable=False)
    offset_target_t: Mapped[float | None] = mapped_column(Float)
    source_note: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = now_col()


class PackageOrder(Base):
    __tablename__ = "package_orders"
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = fk_uuid("companies.id")
    package: Mapped[str] = mapped_column(String(16), nullable=False)  # tree_impact | store_listing | carbon_credits
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
    vat_rate: Mapped[float] = mapped_column(Float, nullable=False)
    vat: Mapped[float] = mapped_column(Float, nullable=False)
    total: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="BDT", nullable=False)
    status: Mapped[str] = mapped_column(String(18), default="unpaid", nullable=False)
    payment_method: Mapped[str] = mapped_column(String(14), nullable=False)  # sslcommerz | bank_transfer
    tran_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    lot_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = now_col()
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("qty > 0", name="qty_pos"),
        CheckConstraint("status in ('unpaid','paid','failed','cancelled','awaiting_transfer')", name="status"),
    )


class TreeAllocation(Base):
    __tablename__ = "tree_allocations"
    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = fk_uuid("package_orders.id")
    tree_id: Mapped[uuid.UUID | None] = fk_uuid("trees.id", nullable=True, ondelete="SET NULL")
    created_at: Mapped[datetime] = now_col()

    __table_args__ = (UniqueConstraint("tree_id"),)


class CreditLot(Base):
    """One lot = N tonnes tied to specific trees. Sold/Retired require a certified registration (M16)."""

    __tablename__ = "credit_lots"
    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[str | None] = mapped_column(String(80))
    tonnes: Mapped[float] = mapped_column(Float, nullable=False)
    serial_prefix: Mapped[str] = mapped_column(String(24), nullable=False)
    state: Mapped[str] = mapped_column(String(10), default="estimated", nullable=False)
    standard: Mapped[str | None] = mapped_column(String(40))
    registry_project_id: Mapped[str | None] = mapped_column(String(80))
    auditor: Mapped[str | None] = mapped_column(String(120))
    certified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    certified_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    sold_to_company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id"))
    sold_order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), unique=True)
    created_at: Mapped[datetime] = now_col()

    __table_args__ = (
        CheckConstraint(f"state in {LOT_STATES}", name="state"),
        CheckConstraint(
            "state not in ('sold','retired') or (standard is not null and registry_project_id is not null "
            "and auditor is not null and certified_at is not null)",
            name="certified_before_sale",
        ),
        CheckConstraint("state not in ('sold','retired') or sold_to_company_id is not null", name="sold_has_buyer"),
        CheckConstraint("tonnes > 0", name="tonnes_pos"),
    )


class CreditLotTree(Base):
    __tablename__ = "credit_lot_trees"
    lot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credit_lots.id", ondelete="CASCADE"), primary_key=True
    )
    tree_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trees.id"), primary_key=True, unique=True
    )


class Retirement(Base):
    __tablename__ = "retirements"
    id: Mapped[uuid.UUID] = uuid_pk()
    lot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credit_lots.id"), unique=True, nullable=False
    )
    company_id: Mapped[uuid.UUID] = fk_uuid("companies.id")
    serial_from: Mapped[str] = mapped_column(String(48), nullable=False)
    serial_to: Mapped[str] = mapped_column(String(48), nullable=False)
    retired_at: Mapped[datetime] = now_col()


class Certificate(Base):
    __tablename__ = "certificates"
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = fk_uuid("companies.id")
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # retirement | impact_report
    lot_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    path: Mapped[str] = mapped_column(Text, nullable=False)
    meta: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = now_col()


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[uuid.UUID] = uuid_pk()
    order_kind: Mapped[str] = mapped_column(String(10), nullable=False)  # package | sapling
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True)
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
    vat_rate: Mapped[float] = mapped_column(Float, nullable=False)
    vat: Mapped[float] = mapped_column(Float, nullable=False)
    total: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    path: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = now_col()


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"
    id: Mapped[uuid.UUID] = uuid_pk()
    order_kind: Mapped[str] = mapped_column(String(10), nullable=False)
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    tran_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    val_id: Mapped[str | None] = mapped_column(String(80), unique=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    validated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(10), nullable=False)  # ipn | success | fail | cancel | admin
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = now_col()


class PayoutLedger(Base):
    """Money for trees is held, then released per verified tree. No automatic payouts (M15)."""

    __tablename__ = "payout_ledger"
    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    tree_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    payee_type: Mapped[str] = mapped_column(String(10), nullable=False)  # pool | nursery | planter
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    state: Mapped[str] = mapped_column(String(10), nullable=False)  # held | released
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = now_col()
