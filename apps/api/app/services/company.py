"""Company marketplace (prompt-v1 §6.10 M1–M23, §6.11).

Companies register with private documents and go live after an admin review. They buy tree impact
packages (trees planted and cared for by local people; CO₂ removal is an estimate, never an offset),
store listings, and — only once a lot is certified under a recognised standard — carbon credits.
Money for trees is held and released per tree only when a verified tree is allocated (ledger
states, no payouts). Payments never create points (M21). Each tonne sells once (constraints + trigger).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..errors import AppError, conflict, forbidden, not_found
from ..models import (
    Action,
    Certificate,
    Company,
    CompanyDocument,
    CompanyMember,
    CreditLot,
    CreditLotTree,
    EmissionsProfile,
    Invoice,
    PackageOrder,
    Partner,
    PartnerMember,
    PayoutLedger,
    Product,
    Redemption,
    Retirement,
    Tree,
    TreeAllocation,
    TreeCheck,
    User,
)
from ..storage import storage
from .notify import notify
from .payments import new_tran_id

PACKAGES = ("tree_impact", "store_listing", "carbon_credits")
DOC_KINDS = ("trade_licence", "tin_bin", "other")
DOC_TYPES = {"application/pdf", "image/jpeg", "image/png"}
DOC_MAX = 10 * 1024 * 1024
ESTIMATE_NOTE = "estimate_not_offset"


async def company_of(db: AsyncSession, user: User) -> Company | None:
    return (
        await db.execute(
            select(Company)
            .join(CompanyMember, CompanyMember.company_id == Company.id)
            .where(CompanyMember.user_id == user.id)
            .limit(1)
        )
    ).scalar_one_or_none()


async def require_company(db: AsyncSession, user: User, *, approved: bool = False) -> Company:
    c = await company_of(db, user)
    if c is None:
        raise forbidden("company.none", "Register your company first")
    if approved and c.status != "approved":
        raise forbidden("company.not_approved", "Your company is waiting for review")
    return c


def company_out(c: Company, docs: list[CompanyDocument] | None = None) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "trade_licence": c.trade_licence,
        "tin_bin": c.tin_bin,
        "contact_name": c.contact_name,
        "contact_email": c.contact_email,
        "contact_phone": c.contact_phone,
        "industry": c.industry,
        "status": c.status,
        "review_note": c.review_note,
        "approved_at": c.approved_at.isoformat() if c.approved_at else None,
        "documents": [{"id": str(d.id), "kind": d.kind, "mime": d.mime, "size": d.size} for d in (docs or [])],
    }


async def register(db: AsyncSession, user: User, data: dict, docs: list[tuple[str, bytes, str]]) -> Company:
    if await company_of(db, user) is not None:
        raise conflict("company.exists", "You already registered a company")
    kinds = {k for k, _, _ in docs}
    if not {"trade_licence", "tin_bin"} <= kinds:
        raise AppError(400, "company.documents", "Attach the trade licence and the TIN or BIN certificate")
    c = Company(**data)
    db.add(c)
    await db.flush()
    db.add(CompanyMember(company_id=c.id, user_id=user.id, role="admin"))
    st = storage()
    for kind, data_, mime in docs:
        if kind not in DOC_KINDS:
            raise AppError(400, "company.doc_kind", "Unknown document type")
        if mime not in DOC_TYPES:
            raise AppError(415, "company.doc_type", "Send PDF, JPEG or PNG documents")
        if len(data_) > DOC_MAX:
            raise AppError(413, "company.doc_size", "Documents must be 10 MB or less")
        ext = {"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png"}[mime]
        path = st.save(f"private/company/{c.id}/{kind}-{uuid.uuid4().hex[:8]}.{ext}", data_)
        db.add(CompanyDocument(company_id=c.id, kind=kind, path=path, mime=mime, size=len(data_)))
    await db.commit()
    return c


async def documents(db: AsyncSession, c: Company) -> list[CompanyDocument]:
    return list((await db.execute(select(CompanyDocument).where(CompanyDocument.company_id == c.id))).scalars().all())


async def patch(db: AsyncSession, c: Company, data: dict) -> Company:
    for k in ("contact_name", "contact_email", "contact_phone", "industry"):
        if data.get(k) is not None:
            setattr(c, k, data[k])
    if c.status == "pending":
        for k in ("name", "trade_licence", "tin_bin"):
            if data.get(k) is not None:
                setattr(c, k, data[k])
    await db.commit()
    return c


async def emissions(db: AsyncSession, c: Company) -> list[dict]:
    rows = (
        (
            await db.execute(
                select(EmissionsProfile)
                .where(EmissionsProfile.company_id == c.id)
                .order_by(EmissionsProfile.year.desc())
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "year": r.year,
            "tonnes_co2e": r.tonnes_co2e,
            "offset_target_t": r.offset_target_t,
            "source_note": r.source_note,
            "label": "company_reported",
        }
        for r in rows
    ]


async def set_emissions(
    db: AsyncSession, c: Company, year: int, tonnes: float, target: float | None, note: str | None
) -> list[dict]:
    row = await db.get(EmissionsProfile, (c.id, year))
    if row is None:
        db.add(
            EmissionsProfile(company_id=c.id, year=year, tonnes_co2e=tonnes, offset_target_t=target, source_note=note)
        )
    else:
        row.tonnes_co2e, row.offset_target_t, row.source_note = tonnes, target, note
    await db.commit()
    return await emissions(db, c)


async def certified_tonnes_available(db: AsyncSession) -> float:
    return float(
        (
            await db.execute(select(func.coalesce(func.sum(CreditLot.tonnes), 0)).where(CreditLot.state == "verified"))
        ).scalar_one()
    )


async def packages(db: AsyncSession) -> list[dict]:
    avail = await certified_tonnes_available(db)
    common = {"vat_rate": settings.vat_rate, "bank_transfer_min": settings.bank_transfer_min_bdt}
    rows = [
        {
            "id": "tree_impact",
            "unit": "tree",
            "unit_price": settings.tree_package_bdt,
            "currency": "BDT",
            "enabled": True,
            "note": ESTIMATE_NOTE,
            "co2_kg_per_tree_year": settings.co2_kg_per_tree_year,
        },
        {
            "id": "store_listing",
            "unit": "year",
            "unit_price": settings.store_listing_fee_bdt,
            "currency": "BDT",
            "enabled": True,
            "note": "products_in_kind",
        },
        {
            "id": "carbon_credits",
            "unit": "tonne",
            "unit_price": settings.credit_price_bdt,
            "currency": "BDT",
            "enabled": avail > 0,
            "available_tonnes": avail,
            "note": "certified_only",
        },
    ]
    return [r | common for r in rows]


def order_out(o: PackageOrder) -> dict:
    return {
        "id": str(o.id),
        "package": o.package,
        "qty": o.qty,
        "unit_price": o.unit_price,
        "subtotal": o.subtotal,
        "vat_rate": o.vat_rate,
        "vat": o.vat,
        "total": o.total,
        "currency": o.currency,
        "status": o.status,
        "payment_method": o.payment_method,
        "created_at": o.created_at.isoformat(),
        "paid_at": o.paid_at.isoformat() if o.paid_at else None,
        "note": ESTIMATE_NOTE if o.package == "tree_impact" else None,
    }


async def create_order(db: AsyncSession, c: Company, package: str, qty: int, method: str) -> PackageOrder:
    if package not in PACKAGES:
        raise AppError(400, "company.package", "Unknown package")
    if method not in ("sslcommerz", "bank_transfer"):
        raise AppError(400, "company.payment_method", "Pick online payment or bank transfer")
    if qty < 1 or qty > 100000:
        raise AppError(400, "company.qty", "Quantity out of range")
    price = {
        "tree_impact": settings.tree_package_bdt,
        "store_listing": settings.store_listing_fee_bdt,
        "carbon_credits": settings.credit_price_bdt,
    }[package]
    if package == "carbon_credits" and qty > await certified_tonnes_available(db):
        # M6 / M17: no certified tonnes, no credit sales.
        raise AppError(
            409,
            "company.credits_unavailable",
            "Carbon credits can be bought only from certified lots, and none are available",
        )
    subtotal = round(price * qty, 2)
    vat = round(subtotal * settings.vat_rate, 2)
    total = round(subtotal + vat, 2)
    if method == "bank_transfer" and total < settings.bank_transfer_min_bdt:
        raise AppError(400, "company.transfer_min", "Bank transfer is for large orders; pay online instead")
    o = PackageOrder(
        company_id=c.id,
        package=package,
        qty=qty,
        unit_price=price,
        subtotal=subtotal,
        vat_rate=settings.vat_rate,
        vat=vat,
        total=total,
        payment_method=method,
        status="awaiting_transfer" if method == "bank_transfer" else "unpaid",
        tran_id=new_tran_id("PKG"),
    )
    db.add(o)
    await db.commit()
    return o


async def on_paid(db: AsyncSession, o: PackageOrder) -> None:
    """Hold tree money, open a store listing, or sell certified tonnes. Never awards points (M21)."""
    if o.package == "tree_impact":
        db.add(
            PayoutLedger(
                order_id=o.id,
                payee_type="pool",
                amount=o.subtotal,
                state="held",
                note=f"{o.qty} trees held until each is verified",
            )
        )
        await allocate(db, o)
    elif o.package == "store_listing":
        c = await db.get(Company, o.company_id)
        p = (await db.execute(select(Partner).where(Partner.company_id == c.id))).scalar_one_or_none()
        if p is None:
            p = Partner(
                name=c.name,
                company_id=c.id,
                logo_emoji="🏢",
                csr_line=None,
                city="Dhaka",
                status="active",
                is_pilot=True,
                listing_fee_bdt=o.subtotal,
            )
            db.add(p)
            await db.flush()
        else:
            p.status = "active"
        for m in (
            (await db.execute(select(CompanyMember.user_id).where(CompanyMember.company_id == c.id))).scalars().all()
        ):
            if (
                await db.execute(
                    select(PartnerMember).where(PartnerMember.partner_id == p.id, PartnerMember.user_id == m)
                )
            ).first() is None:
                db.add(PartnerMember(partner_id=p.id, user_id=m, role="admin"))
    elif o.package == "carbon_credits":
        await sell_credits(db, o)
    for uid in (
        (await db.execute(select(CompanyMember.user_id).where(CompanyMember.company_id == o.company_id)))
        .scalars()
        .all()
    ):
        await notify(
            db,
            uid,
            "verification",
            {"code": "notif.company.paid", "params": {"package": o.package, "qty": o.qty}},
            screen="S20",
            params={"order_id": str(o.id)},
        )


async def allocate(db: AsyncSession, o: PackageOrder | None = None) -> int:
    """Give verified, unallocated trees to paid tree orders (oldest first) and release their money per tree."""
    q = (
        select(PackageOrder)
        .where(PackageOrder.package == "tree_impact", PackageOrder.status == "paid")
        .order_by(PackageOrder.paid_at)
    )
    orders = [o] if o is not None else list((await db.execute(q)).scalars().all())
    n = 0
    for order in orders:
        have = (
            await db.execute(
                select(func.count()).select_from(TreeAllocation).where(TreeAllocation.order_id == order.id)
            )
        ).scalar_one()
        need = order.qty - have
        if need <= 0:
            continue
        taken = select(TreeAllocation.tree_id).where(TreeAllocation.tree_id.is_not(None))
        trees = (
            (
                await db.execute(
                    select(Tree)
                    .join(Action, Action.id == Tree.action_id)
                    .where(Action.status == "verified", Tree.revoked.is_(False), Tree.id.not_in(taken))
                    .order_by(Tree.planted_at)
                    .limit(need)
                )
            )
            .scalars()
            .all()
        )
        for t in trees:
            db.add(TreeAllocation(order_id=order.id, tree_id=t.id))
            db.add(
                PayoutLedger(
                    order_id=order.id,
                    tree_id=t.id,
                    payee_type="pool",
                    amount=-order.unit_price,
                    state="held",
                    note="moved to planter",
                )
            )
            # R2: the platform fee per verified tree is recorded; the planter gets the rest.
            fee = round(min(settings.fee_per_tree_bdt, order.unit_price), 2)
            db.add(
                PayoutLedger(
                    order_id=order.id,
                    tree_id=t.id,
                    payee_type="planter",
                    amount=round(order.unit_price - fee, 2),
                    state="released",
                    note=f"tree {t.id} verified",
                )
            )
            if fee > 0:
                db.add(
                    PayoutLedger(
                        order_id=order.id,
                        tree_id=t.id,
                        payee_type="platform",
                        amount=fee,
                        state="released",
                        note="fee per verified tree",
                    )
                )
            n += 1
    await db.flush()
    return n


async def sell_credits(db: AsyncSession, o: PackageOrder) -> None:
    """M16: certified lots move Verified → Sold → Retired in the buyer's name, with serial numbers."""
    left = float(o.qty)
    lots = (
        (
            await db.execute(
                select(CreditLot).where(CreditLot.state == "verified").order_by(CreditLot.created_at).with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for lot in lots:
        if left <= 0:
            break
        if lot.tonnes > left + 1e-9:
            continue  # lots sell whole; partial splits are a human decision
        lot.state = "sold"
        lot.sold_to_company_id = o.company_id
        lot.sold_order_id = o.id
        await db.flush()
        lot.state = "retired"
        n = int(round(lot.tonnes))
        db.add(
            Retirement(
                lot_id=lot.id,
                company_id=o.company_id,
                serial_from=f"{lot.serial_prefix}-{1:06d}",
                serial_to=f"{lot.serial_prefix}-{n:06d}",
            )
        )
        o.lot_id = lot.id
        left -= lot.tonnes
    if left > 1e-9:
        raise AppError(409, "company.credits_unavailable", "Not enough certified tonnes in whole lots")
    await db.flush()


async def overview(db: AsyncSession, c: Company) -> dict:
    orders = (
        (await db.execute(select(PackageOrder).where(PackageOrder.company_id == c.id, PackageOrder.status == "paid")))
        .scalars()
        .all()
    )
    tree_orders = [o.id for o in orders if o.package == "tree_impact"]
    funded = sum(o.qty for o in orders if o.package == "tree_impact")
    alloc = (
        (
            await db.execute(
                select(Tree)
                .join(TreeAllocation, TreeAllocation.tree_id == Tree.id)
                .where(TreeAllocation.order_id.in_(tree_orders))
            )
        )
        .scalars()
        .all()
        if tree_orders
        else []
    )
    alive = 0
    for t in alloc:
        last = (
            await db.execute(
                select(TreeCheck.health).where(TreeCheck.tree_id == t.id).order_by(TreeCheck.created_at.desc()).limit(1)
            )
        ).scalar_one_or_none()
        if not t.revoked and not t.lost_confirmed and last != "dead":
            alive += 1
    now = datetime.now(UTC)
    est_t = round(
        sum(max(0.0, (now - t.planted_at).days / 365.25) * settings.co2_kg_per_tree_year for t in alloc) / 1000, 3
    )
    certified_t = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(CreditLot.tonnes), 0)).where(
                    CreditLot.sold_to_company_id == c.id, CreditLot.state == "retired"
                )
            )
        ).scalar_one()
    )
    people = len({t.user_id for t in alloc})
    partner = (await db.execute(select(Partner).where(Partner.company_id == c.id))).scalar_one_or_none()
    redeemed = 0
    if partner is not None:
        redeemed = (
            await db.execute(
                select(func.count())
                .select_from(Redemption)
                .join(Product, Product.id == Redemption.product_id)
                .where(Product.partner_id == partner.id)
            )
        ).scalar_one()
    return {
        "trees_funded": funded,
        "trees_allocated": len(alloc),
        "trees_alive": alive,
        "survival_rate": round(alive / len(alloc), 3) if alloc else None,
        "co2e_estimated_t": est_t,
        "co2e_certified_t": certified_t,
        "people_reached": people,
        "products_redeemed": int(redeemed),
        "has_store_listing": partner is not None and partner.status == "active",
        "note": ESTIMATE_NOTE,
    }


async def invoices(db: AsyncSession, c: Company) -> list[dict]:
    rows = (
        (await db.execute(select(Invoice).where(Invoice.company_id == c.id).order_by(Invoice.created_at.desc())))
        .scalars()
        .all()
    )
    return [
        {
            "id": str(i.id),
            "number": i.number,
            "subtotal": i.subtotal,
            "vat_rate": i.vat_rate,
            "vat": i.vat,
            "total": i.total,
            "currency": i.currency,
            "created_at": i.created_at.isoformat(),
        }
        for i in rows
    ]


async def certificates(db: AsyncSession, c: Company) -> list[dict]:
    rows = (
        (
            await db.execute(
                select(Certificate).where(Certificate.company_id == c.id).order_by(Certificate.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    rets = (await db.execute(select(Retirement).where(Retirement.company_id == c.id))).scalars().all()
    return [{"id": str(x.id), "kind": x.kind, "created_at": x.created_at.isoformat(), "meta": x.meta} for x in rows] + [
        {
            "id": str(r.id),
            "kind": "retirement_record",
            "serial_from": r.serial_from,
            "serial_to": r.serial_to,
            "retired_at": r.retired_at.isoformat(),
        }
        for r in rets
    ]


# ── admin (M2, M14, M16) ────────────────────────────────────────────────────


async def admin_review(db: AsyncSession, admin: User, cid: uuid.UUID, approve: bool, note: str | None) -> Company:
    c = await db.get(Company, cid)
    if c is None:
        raise not_found("company.not_found", "Company not found")
    c.status = "approved" if approve else "rejected"
    c.review_note = note
    c.approved_at = datetime.now(UTC) if approve else None
    c.approved_by = admin.id
    for uid in (
        (await db.execute(select(CompanyMember.user_id).where(CompanyMember.company_id == c.id))).scalars().all()
    ):
        await notify(
            db,
            uid,
            "verification",
            {"code": "notif.company.approved" if approve else "notif.company.rejected", "params": {"name": c.name}},
            screen="S20",
            params={},
        )
    await db.commit()
    return c


async def admin_create_lot(
    db: AsyncSession, tree_ids: list[uuid.UUID], tonnes: float, project_id: str | None
) -> CreditLot:
    if not tree_ids:
        raise AppError(400, "credit_lot.trees", "A lot needs its trees")
    lot = CreditLot(
        project_id=project_id,
        tonnes=tonnes,
        serial_prefix=f"ATX-{datetime.now(UTC).year}-{uuid.uuid4().hex[:6].upper()}",
        state="estimated",
    )
    db.add(lot)
    await db.flush()
    for t in tree_ids:
        if await db.get(Tree, t) is None:
            raise not_found("tree.not_found", "Tree not found")
        db.add(CreditLotTree(lot_id=lot.id, tree_id=t))
    await db.commit()
    return lot


async def admin_certify(
    db: AsyncSession, admin: User, lot_id: uuid.UUID, standard: str, registry_project_id: str, auditor: str
) -> CreditLot:
    lot = await db.get(CreditLot, lot_id)
    if lot is None:
        raise not_found("credit_lot.not_found", "Lot not found")
    if lot.state != "estimated":
        raise AppError(409, "credit_lot.state", "Only estimated lots can be certified")
    lot.standard, lot.registry_project_id, lot.auditor = standard, registry_project_id, auditor
    lot.certified_at, lot.certified_by = datetime.now(UTC), admin.id
    lot.state = "verified"
    await db.commit()
    return lot


def lot_out(lot: CreditLot) -> dict:
    return {
        "id": str(lot.id),
        "project_id": lot.project_id,
        "tonnes": lot.tonnes,
        "serial_prefix": lot.serial_prefix,
        "state": lot.state,
        "standard": lot.standard,
        "registry_project_id": lot.registry_project_id,
        "auditor": lot.auditor,
        "certified_at": lot.certified_at.isoformat() if lot.certified_at else None,
        "sold_to_company_id": str(lot.sold_to_company_id) if lot.sold_to_company_id else None,
    }


async def admin_confirm_transfer(db: AsyncSession, admin: User, order_id: uuid.UUID) -> PackageOrder:
    o = (
        await db.execute(select(PackageOrder).where(PackageOrder.id == order_id).with_for_update())
    ).scalar_one_or_none()
    if o is None:
        raise not_found("order.not_found", "Order not found")
    if o.status != "awaiting_transfer":
        raise AppError(409, "order.not_awaiting", "This order isn't waiting for a bank transfer")
    from ..models import PaymentTransaction
    from .payments import mark_paid

    db.add(
        PaymentTransaction(
            order_kind="package",
            order_id=o.id,
            tran_id=o.tran_id,
            amount=o.total,
            currency=o.currency,
            status="VALID",
            validated=True,
            source="admin",
            payload={"confirmed_by": str(admin.id)},
        )
    )
    await mark_paid(db, "package", o, "admin")
    await db.commit()
    return o
