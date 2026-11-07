"""Payments for sapling orders and company packages (prompt-v1 §6.10 M14–M15).

Every gateway result (success, fail, cancel, IPN) is validated server-to-server with the Order
Validation API, including the amount, before an order changes. Handling is idempotent: a `val_id`
is recorded once, and a paid order stays paid. Each paid order gets one VAT invoice.
"""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..errors import AppError
from ..http import UpstreamError
from ..models import Invoice, PackageOrder, PaymentTransaction, SaplingOrder
from ..providers import sslcommerz as SSL

log = logging.getLogger("atmos.payments")


def new_tran_id(prefix: str) -> str:
    return f"{prefix}{datetime.now(UTC).strftime('%y%m%d')}{secrets.token_hex(6).upper()}"


def callback_base() -> str:
    return f"{settings.public_web_origin.rstrip('/')}/api/v1/payments/sslcommerz"


async def find_order(db: AsyncSession, tran_id: str) -> tuple[str, PackageOrder | SaplingOrder] | None:
    o = (
        await db.execute(select(PackageOrder).where(PackageOrder.tran_id == tran_id).with_for_update())
    ).scalar_one_or_none()
    if o is not None:
        return "package", o
    s = (
        await db.execute(select(SaplingOrder).where(SaplingOrder.tran_id == tran_id).with_for_update())
    ).scalar_one_or_none()
    if s is not None:
        return "sapling", s
    return None


def _amount(kind: str, o) -> tuple[float, str]:
    if kind == "package":
        return float(o.total), o.currency
    vat = round(o.amount_bdt * settings.vat_rate, 2)
    return round(o.amount_bdt + vat, 2), "BDT"


async def start_checkout(db: AsyncSession, kind: str, o, *, product_name: str, category: str, customer: dict) -> str:
    amount, currency = _amount(kind, o)
    s = await SSL.init_session(
        tran_id=o.tran_id,
        amount=amount,
        currency=currency,
        product_name=product_name,
        product_category=category,
        customer=customer,
        callback_base=callback_base(),
        ipn_url=f"{callback_base()}/ipn",
    )
    return s["url"]


async def _invoice(db: AsyncSession, kind: str, o) -> Invoice:
    existing = (await db.execute(select(Invoice).where(Invoice.order_id == o.id))).scalar_one_or_none()
    if existing:
        return existing
    year = datetime.now(UTC).year
    n = (
        await db.execute(select(func.count()).select_from(Invoice).where(Invoice.number.like(f"ATX-{year}-%")))
    ).scalar_one()
    if kind == "package":
        subtotal, vat_rate, vat, total, currency, company = (
            o.subtotal,
            o.vat_rate,
            o.vat,
            o.total,
            o.currency,
            o.company_id,
        )
    else:
        subtotal = o.amount_bdt
        vat_rate = settings.vat_rate
        vat = round(subtotal * vat_rate, 2)
        total, currency, company = round(subtotal + vat, 2), "BDT", None
    inv = Invoice(
        order_kind=kind,
        order_id=o.id,
        company_id=company,
        number=f"ATX-{year}-{n + 1:05d}",
        subtotal=subtotal,
        vat_rate=vat_rate,
        vat=vat,
        total=total,
        currency=currency,
    )
    db.add(inv)
    await db.flush()
    return inv


async def mark_paid(db: AsyncSession, kind: str, o, source: str) -> bool:
    """Idempotent: True only the first time the order becomes paid."""
    if o.status == "paid":
        return False
    o.status = "paid"
    o.paid_at = datetime.now(UTC)
    await _invoice(db, kind, o)
    if kind == "package":
        from . import company as CO

        await CO.on_paid(db, o)
    else:
        from . import store as ST

        await ST.on_sapling_paid(db, o)
    log.info("order paid", extra={"data": {"kind": kind, "order": str(o.id), "source": source}})
    return True


async def handle_callback(db: AsyncSession, source: str, form: dict) -> tuple[str | None, str]:
    """Returns (order kind, outcome: paid | already | failed | cancelled | invalid | unknown)."""
    tran_id = str(form.get("tran_id") or "")
    found = await find_order(db, tran_id) if tran_id else None
    if found is None:
        log.warning("payment callback for an unknown order", extra={"data": {"source": source}})
        return None, "unknown"
    kind, o = found
    amount, currency = _amount(kind, o)
    val_id = form.get("val_id")
    status = str(form.get("status") or source).upper()
    validated = False
    payload = {
        k: form.get(k)
        for k in (
            "status",
            "tran_id",
            "val_id",
            "amount",
            "currency",
            "card_type",
            "bank_tran_id",
            "tran_date",
            "error",
        )
        if k in form
    }
    if val_id:
        try:
            v = await SSL.validate(str(val_id))
        except UpstreamError as e:
            log.warning("payment validation failed to run", extra={"data": {"err": str(e)[:120]}})
            v = {}
        validated = SSL.is_valid(v, tran_id=tran_id, amount=amount, currency=currency)
        payload["validation_status"] = v.get("status")
        status = "VALID" if validated else "INVALID"
    stmt = insert(PaymentTransaction).values(
        id=uuid.uuid4(),
        order_kind=kind,
        order_id=o.id,
        tran_id=tran_id,
        val_id=str(val_id) if val_id else None,
        amount=amount,
        currency=currency,
        status=status[:16],
        validated=validated,
        source=source,
        payload=payload,
    )
    if val_id:
        stmt = stmt.on_conflict_do_nothing(index_elements=["val_id"])
    await db.execute(stmt)
    if validated:
        first = await mark_paid(db, kind, o, source)
        await db.commit()
        return kind, "paid" if first else "already"
    if source in ("fail", "cancel") and o.status == "unpaid":
        o.status = "failed" if source == "fail" else "cancelled"
        await db.commit()
        return kind, "failed" if source == "fail" else "cancelled"
    await db.commit()
    return kind, "invalid"


def require_gateway() -> None:
    if not settings.sslcommerz_enabled:
        raise AppError(503, "payments.unavailable", "Online payment isn't set up yet")
