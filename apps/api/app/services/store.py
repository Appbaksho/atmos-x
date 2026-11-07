"""Points store and sapling marketplace (prompt-v1 §6.9 S1–S17).

Redeeming is one database transaction: the person's row is locked (one spend at a time), the
product's row is locked (no overselling), only spendable points are spent (never pending), and
the per-person and per-device monthly limits are checked. A voucher is valid for 14 days.
Points hold no cash value and can't be transferred or sold. Saplings are paid in taka; the
commission is recorded and the nursery's share is held until delivery.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..engines.heat import haversine_m
from ..errors import AppError, forbidden, not_found
from ..models import (
    NurseryPartner,
    NurseryProduct,
    Partner,
    PartnerMember,
    PartnerOutlet,
    PayoutLedger,
    Product,
    Profile,
    Redemption,
    SaplingOrder,
    User,
    Voucher,
)
from ..ratelimit import day_start_local
from . import points as PTS
from .notify import notify
from .payments import new_tran_id

CATEGORIES = ("food", "home", "garden", "vouchers")
VOUCHER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def month_start(now: datetime | None = None) -> datetime:
    now = now or datetime.now(UTC)
    d = day_start_local(now)
    local = d + timedelta(minutes=360)
    return local.replace(day=1) - timedelta(minutes=360)


def _demo_ok(is_demo: bool, viewer: User | None) -> bool:
    return is_demo == bool(viewer is not None and viewer.is_demo)


def price_band(declared_value_bdt: float) -> tuple[int, int]:
    """M22: the allowed points price for a declared value."""
    mid = declared_value_bdt * settings.points_per_bdt
    t = settings.points_price_tolerance
    return max(1, int(mid * (1 - t))), max(1, int(round(mid * (1 + t))))


def partner_out(p: Partner, n_products: int = 0) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "logo_url": p.logo_url,
        "logo_emoji": p.logo_emoji,
        "csr_line": p.csr_line,
        "city": p.city,
        "is_pilot": p.is_pilot,
        "is_demo": p.is_demo,
        "products": n_products,
    }


async def product_out(db: AsyncSession, pr: Product, viewer: User | None, spendable: int | None = None) -> dict:
    partner = await db.get(Partner, pr.partner_id)
    outlets = (await db.execute(select(PartnerOutlet).where(PartnerOutlet.partner_id == pr.partner_id))).scalars().all()
    return {
        "id": str(pr.id),
        "partner": partner_out(partner) if partner else None,
        "name": pr.name,
        "description": pr.description,
        "category": pr.category,
        "photo_url": pr.photo_url,
        "emoji": pr.emoji,
        "points_price": pr.points_price,
        "stock": pr.stock,
        "fulfilment": pr.fulfilment,
        "delivery_area": pr.delivery_area,
        "terms": pr.terms,
        "monthly_limit": pr.monthly_limit,
        "outlets": [
            {
                "id": str(o.id),
                "name": o.name,
                "address": o.address,
                "location": {"lat": o.lat, "lng": o.lng} if o.lat is not None else None,
            }
            for o in outlets
        ],
        "can_afford": spendable is not None and spendable >= pr.points_price,
        "is_demo": pr.is_demo,
    }


async def partners(db: AsyncSession, viewer: User | None) -> list[dict]:
    rows = (
        (
            await db.execute(
                select(Partner)
                .where(Partner.status == "active", Partner.is_demo.is_(bool(viewer is not None and viewer.is_demo)))
                .order_by(Partner.created_at)
            )
        )
        .scalars()
        .all()
    )
    counts = dict(
        (
            await db.execute(
                select(Product.partner_id, func.count())
                .where(Product.active.is_(True), Product.stock > 0)
                .group_by(Product.partner_id)
            )
        ).all()
    )
    return [partner_out(p, int(counts.get(p.id, 0))) for p in rows]


async def products(db: AsyncSession, viewer: User | None, flt: str | None) -> dict:
    demo = bool(viewer is not None and viewer.is_demo)
    q = (
        select(Product)
        .join(Partner, Partner.id == Product.partner_id)
        .where(Product.active.is_(True), Partner.status == "active", Product.is_demo.is_(demo))
    )
    if flt in CATEGORIES:
        q = q.where(Product.category == flt)
    rows = (await db.execute(q.order_by(Product.points_price))).scalars().all()
    bal = await PTS.balances(db, viewer.id) if viewer is not None and viewer.role != "guest" else None
    spend = bal["spendable"] if bal else None
    items = [await product_out(db, p, viewer, spend) for p in rows]
    if flt == "can_afford":
        items = [i for i in items if i["can_afford"] and i["stock"] > 0]
    out = {
        "products": items,
        "pilot": any(
            p.is_pilot for p in (await db.execute(select(Partner).where(Partner.status == "active"))).scalars().all()
        ),
    }
    if bal is not None:
        out["points"] = {
            "spendable": bal["spendable"],
            "pending": bal["pending"],
            "next_unlock_at": await PTS.next_unlock_at(db, viewer.id),
        }
    return out


async def get_product(db: AsyncSession, pid: uuid.UUID, viewer: User | None) -> Product:
    p = await db.get(Product, pid)
    if p is None or not _demo_ok(p.is_demo, viewer):
        raise not_found("store.product_not_found", "Product not found")
    return p


def _voucher_code() -> str:
    return "".join(secrets.choice(VOUCHER_ALPHABET) for _ in range(10))


async def redeem(
    db: AsyncSession, user: User, pid: uuid.UUID, *, delivery_address: str | None, device_id: str | None
) -> Redemption:
    # One spend at a time per person (S14): lock the person's row for this transaction.
    await db.execute(text("SELECT id FROM users WHERE id = :u FOR UPDATE"), {"u": user.id})
    pr = (await db.execute(select(Product).where(Product.id == pid).with_for_update())).scalar_one_or_none()
    if pr is None or not pr.active or not _demo_ok(pr.is_demo, user):
        raise not_found("store.product_not_found", "Product not found")
    if pr.stock <= 0:
        raise AppError(409, "store.sold_out", "This product is out of stock")
    if pr.fulfilment == "delivery" and not (delivery_address or "").strip():
        raise AppError(400, "store.address", "Enter a delivery address", fields={"delivery_address": "required"})
    since = month_start()
    mine = (
        await db.execute(
            select(func.count())
            .select_from(Redemption)
            .where(Redemption.user_id == user.id, Redemption.created_at >= since, Redemption.status != "cancelled")
        )
    ).scalar_one()
    if mine >= settings.store_monthly_per_person:
        raise AppError(
            429, "store.monthly_limit", f"You can redeem up to {settings.store_monthly_per_person} items a month"
        )
    this = (
        await db.execute(
            select(func.count())
            .select_from(Redemption)
            .where(
                Redemption.user_id == user.id,
                Redemption.product_id == pr.id,
                Redemption.created_at >= since,
                Redemption.status != "cancelled",
            )
        )
    ).scalar_one()
    if this >= pr.monthly_limit:
        raise AppError(429, "store.product_limit", "You've reached this product's monthly limit")
    if device_id:
        dev = (
            await db.execute(
                select(func.count())
                .select_from(Redemption)
                .where(
                    Redemption.device_id == device_id, Redemption.created_at >= since, Redemption.status != "cancelled"
                )
            )
        ).scalar_one()
        if dev >= settings.store_monthly_per_device:
            raise AppError(429, "store.device_limit", "This device has reached the monthly limit")
    r = Redemption(
        user_id=user.id,
        product_id=pr.id,
        points=pr.points_price,
        status="issued" if pr.fulfilment == "pickup" else "processing",
        delivery_address=(delivery_address or "").strip()[:500] or None,
        device_id=device_id,
    )
    db.add(r)
    await db.flush()
    await PTS.spend(db, user.id, pr.points_price, source_type="redemption", source_id=str(r.id))  # 409 when short
    pr.stock -= 1
    if pr.fulfilment == "pickup":
        for _ in range(5):
            code = _voucher_code()
            if not (await db.execute(select(Voucher.id).where(Voucher.code == code))).first():
                break
        db.add(
            Voucher(redemption_id=r.id, code=code, expires_at=datetime.now(UTC) + timedelta(days=settings.voucher_days))
        )
    await notify(
        db,
        user.id,
        "verification",
        {"code": "notif.store.redeemed", "params": {"product": pr.name, "points": pr.points_price}},
        screen="S20",
        params={"redemption_id": str(r.id)},
    )
    await db.commit()
    return r


async def order_out(db: AsyncSession, r: Redemption) -> dict:
    pr = await db.get(Product, r.product_id)
    partner = await db.get(Partner, pr.partner_id) if pr else None
    v = (await db.execute(select(Voucher).where(Voucher.redemption_id == r.id))).scalar_one_or_none()
    status = r.status
    if v is not None and v.collected_at is None and v.expires_at < datetime.now(UTC) and status == "issued":
        status = "expired"
    return {
        "id": str(r.id),
        "product": {
            "id": str(pr.id),
            "name": pr.name,
            "emoji": pr.emoji,
            "photo_url": pr.photo_url,
            "fulfilment": pr.fulfilment,
        }
        if pr
        else None,
        "partner": partner_out(partner) if partner else None,
        "points": r.points,
        "status": status,
        "voucher": {
            "code": v.code,
            "expires_at": v.expires_at.isoformat(),
            "collected_at": v.collected_at.isoformat() if v.collected_at else None,
        }
        if v
        else None,
        "delivery_address": r.delivery_address,
        "created_at": r.created_at.isoformat(),
        "collected_at": r.collected_at.isoformat() if r.collected_at else None,
    }


async def my_orders(db: AsyncSession, user: User) -> list[dict]:
    rows = (
        (
            await db.execute(
                select(Redemption)
                .where(Redemption.user_id == user.id)
                .order_by(Redemption.created_at.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    return [await order_out(db, r) for r in rows]


# ── partner portal (S11–S13) ────────────────────────────────────────────────


async def my_partner(db: AsyncSession, user: User) -> Partner:
    p = (
        await db.execute(
            select(Partner)
            .join(PartnerMember, PartnerMember.partner_id == Partner.id)
            .where(PartnerMember.user_id == user.id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if p is None:
        raise forbidden("partner.not_member", "This is for store partners")
    return p


def _check_price(points_price: int, declared: float) -> None:
    lo, hi = price_band(declared)
    if not (lo <= points_price <= hi):
        raise AppError(
            400,
            "partner.price_band",
            f"For this value the points price must be between {lo} and {hi}",
            fields={"points_price": f"{lo}-{hi}"},
        )


async def upsert_product(db: AsyncSession, partner: Partner, data: dict, pid: uuid.UUID | None = None) -> Product:
    if data.get("category") is not None and data["category"] not in CATEGORIES:
        raise AppError(400, "partner.category", "Pick food, home, garden or vouchers")
    if pid is None:
        _check_price(data["points_price"], data["declared_value_bdt"])
        pr = Product(partner_id=partner.id, is_demo=partner.is_demo, **{k: v for k, v in data.items() if v is not None})
        db.add(pr)
    else:
        pr = await db.get(Product, pid)
        if pr is None or pr.partner_id != partner.id:
            raise not_found("store.product_not_found", "Product not found")
        merged = {
            "points_price": pr.points_price,
            "declared_value_bdt": pr.declared_value_bdt,
            **{k: v for k, v in data.items() if v is not None},
        }
        _check_price(merged["points_price"], merged["declared_value_bdt"])
        for k, v in data.items():
            if v is not None:
                setattr(pr, k, v)
    await db.commit()
    return pr


async def partner_redemptions(db: AsyncSession, partner: Partner) -> list[dict]:
    rows = (
        (
            await db.execute(
                select(Redemption)
                .join(Product, Product.id == Redemption.product_id)
                .where(Product.partner_id == partner.id)
                .order_by(Redemption.created_at.desc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    return [await order_out(db, r) for r in rows]


async def collect(db: AsyncSession, partner: Partner, user: User, code: str, outlet_id: uuid.UUID | None) -> dict:
    v = (
        await db.execute(select(Voucher).where(Voucher.code == code.strip().upper()).with_for_update())
    ).scalar_one_or_none()
    if v is None:
        raise not_found("voucher.not_found", "No voucher has this code")
    r = await db.get(Redemption, v.redemption_id)
    pr = await db.get(Product, r.product_id)
    if pr.partner_id != partner.id:
        raise not_found("voucher.not_found", "No voucher has this code")
    if v.collected_at is not None:
        raise AppError(409, "voucher.used", "This voucher was already collected")
    if v.expires_at < datetime.now(UTC):
        raise AppError(409, "voucher.expired", "This voucher has expired")
    now = datetime.now(UTC)
    v.collected_at, v.collected_by, v.outlet_id = now, user.id, outlet_id
    r.status, r.collected_at = "collected", now
    await notify(
        db,
        r.user_id,
        "verification",
        {"code": "notif.store.collected", "params": {"product": pr.name}},
        screen="S20",
        params={"redemption_id": str(r.id)},
    )
    await db.commit()
    return await order_out(db, r)


async def mark_delivered(db: AsyncSession, partner: Partner, rid: uuid.UUID) -> dict:
    r = await db.get(Redemption, rid)
    pr = await db.get(Product, r.product_id) if r else None
    if r is None or pr is None or pr.partner_id != partner.id:
        raise not_found("store.order_not_found", "Order not found")
    r.status, r.collected_at = "collected", datetime.now(UTC)
    await db.commit()
    return await order_out(db, r)


# ── saplings (S5) ───────────────────────────────────────────────────────────


async def sapling_products(db: AsyncSession, viewer: User | None, lat: float | None, lng: float | None) -> dict:
    demo = bool(viewer is not None and viewer.is_demo)
    rows = (
        await db.execute(
            select(NurseryProduct, NurseryPartner)
            .join(NurseryPartner, NurseryPartner.id == NurseryProduct.nursery_id)
            .where(NurseryProduct.active.is_(True), NurseryPartner.status == "active", NurseryPartner.is_demo.is_(demo))
        )
    ).all()
    items = []
    for pr, n in rows:
        d = haversine_m(lat, lng, n.lat, n.lng) if lat is not None and lng is not None else None
        if d is not None and d > 30000:
            continue
        items.append(
            {
                "id": str(pr.id),
                "name": pr.name,
                "species_id": pr.species_id,
                "kind": pr.kind,
                "price_bdt": pr.price_bdt,
                "stock": pr.stock,
                "photo_url": pr.photo_url,
                "nursery": {
                    "id": str(n.id),
                    "name": n.name,
                    "address": n.address,
                    "dist_m": round(d) if d is not None else None,
                },
                "is_demo": n.is_demo,
            }
        )
    items.sort(key=lambda i: (i["nursery"]["dist_m"] or 0, i["price_bdt"]))
    return {"products": items, "vat_rate": settings.vat_rate, "payments": settings.sslcommerz_enabled}


async def create_sapling_order(
    db: AsyncSession, user: User, pid: uuid.UUID, qty: int, address: str | None
) -> SaplingOrder:
    pr = (
        await db.execute(select(NurseryProduct).where(NurseryProduct.id == pid).with_for_update())
    ).scalar_one_or_none()
    n = await db.get(NurseryPartner, pr.nursery_id) if pr else None
    if pr is None or n is None or not pr.active or n.status != "active" or not _demo_ok(n.is_demo, user):
        raise not_found("saplings.not_found", "Product not found")
    if qty < 1 or qty > 200:
        raise AppError(400, "saplings.qty", "Order 1 to 200")
    if pr.stock < qty:
        raise AppError(409, "saplings.stock", "Not enough in stock")
    amount = round(pr.price_bdt * qty, 2)
    o = SaplingOrder(
        user_id=user.id,
        nursery_product_id=pr.id,
        qty=qty,
        amount_bdt=amount,
        commission_bdt=round(amount * n.commission_pct / 100, 2),
        tran_id=new_tran_id("SAP"),
        delivery_address=(address or "").strip()[:500] or None,
        meta={"nursery_id": str(n.id), "name": pr.name},
    )
    db.add(o)
    await db.commit()
    return o


async def on_sapling_paid(db: AsyncSession, o: SaplingOrder) -> None:
    """Stock comes off, the commission is recorded, the nursery's share is held until delivery."""
    pr = (
        await db.execute(select(NurseryProduct).where(NurseryProduct.id == o.nursery_product_id).with_for_update())
    ).scalar_one()
    pr.stock = max(0, pr.stock - o.qty)
    db.add(PayoutLedger(order_id=o.id, payee_type="pool", amount=o.commission_bdt, state="released", note="commission"))
    db.add(
        PayoutLedger(
            order_id=o.id,
            payee_type="nursery",
            amount=round(o.amount_bdt - o.commission_bdt, 2),
            state="held",
            note=f"nursery {o.meta.get('nursery_id')}",
        )
    )
    await notify(
        db,
        o.user_id,
        "verification",
        {"code": "notif.store.sapling_paid", "params": {"qty": o.qty, "name": o.meta.get("name", "")}},
        screen="S20",
        params={"order_id": str(o.id)},
    )


def sapling_order_out(o: SaplingOrder) -> dict:
    vat = round(o.amount_bdt * settings.vat_rate, 2)
    return {
        "id": str(o.id),
        "name": o.meta.get("name"),
        "qty": o.qty,
        "amount_bdt": o.amount_bdt,
        "vat_bdt": vat,
        "total_bdt": round(o.amount_bdt + vat, 2),
        "status": o.status,
        "created_at": o.created_at.isoformat(),
        "paid_at": o.paid_at.isoformat() if o.paid_at else None,
    }


async def profile_for(db: AsyncSession, user: User) -> dict:
    prof = await db.get(Profile, user.id)
    return {"name": user.display_name, "email": user.email, "phone": user.phone, "city": prof.city if prof else None}


_ = or_
