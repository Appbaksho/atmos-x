"""Points store, saplings, partner portal, company marketplace, payments and admin (prompt-v1 §9
'Store and company')."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..config import settings
from ..deps import DB, Admin, FullUser, ViewerDep
from ..errors import AppError, not_found
from ..models import (
    Company,
    CompanyDocument,
    CreditLot,
    Invoice,
    PackageOrder,
    Partner,
    PartnerOutlet,
    Photo,
    Product,
    Redemption,
    Retirement,
    SaplingOrder,
    Tree,
    TreeAllocation,
    TreeCheck,
)
from ..services import company as CO
from ..services import payments as PAY
from ..services import reports as REP
from ..services import store as ST

router = APIRouter(tags=["market"])


def _user(viewer):
    return viewer.user if viewer.user is not None and not viewer.is_guest else None


def _pdf(data: bytes, name: str) -> Response:
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{name}"', "Cache-Control": "private, no-store"},
    )


# ─────────────────────────── points store (S1–S10) ───────────────────────────


@router.get("/store/partners", operation_id="store_partners")
async def partners(db: DB, viewer: ViewerDep) -> list[dict]:
    return await ST.partners(db, _user(viewer) or viewer.user)


@router.get("/store/products", operation_id="store_products")
async def products(
    db: DB, viewer: ViewerDep, filter: str | None = Query(None, pattern="^(can_afford|food|home|garden|vouchers)$")
) -> dict:  # noqa: A002
    return await ST.products(db, _user(viewer) or viewer.user, filter)


@router.get("/store/products/{product_id}", operation_id="store_product")
async def product(product_id: uuid.UUID, db: DB, viewer: ViewerDep) -> dict:
    user = _user(viewer) or viewer.user
    p = await ST.get_product(db, product_id, user)
    from ..services import points as PTS

    spend = (await PTS.balances(db, user.id))["spendable"] if user is not None and user.role != "guest" else None
    return await ST.product_out(db, p, user, spend)


class RedeemIn(BaseModel):
    delivery_address: str | None = Field(default=None, max_length=500)


@router.post("/store/products/{product_id}/redeem", operation_id="store_redeem")
async def redeem(product_id: uuid.UUID, body: RedeemIn, db: DB, user: FullUser, viewer: ViewerDep) -> dict:
    r = await ST.redeem(db, user, product_id, delivery_address=body.delivery_address, device_id=viewer.device_id)
    return await ST.order_out(db, r)


@router.get("/orders/mine", operation_id="orders_mine")
async def orders_mine(db: DB, user: FullUser) -> dict:
    saps = (
        (
            await db.execute(
                select(SaplingOrder)
                .where(SaplingOrder.user_id == user.id)
                .order_by(SaplingOrder.created_at.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    return {"redemptions": await ST.my_orders(db, user), "saplings": [ST.sapling_order_out(o) for o in saps]}


# ─────────────────────────── saplings (S5) ───────────────────────────


@router.get("/saplings/products", operation_id="saplings_products")
async def sapling_products(
    db: DB,
    viewer: ViewerDep,
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
) -> dict:
    return await ST.sapling_products(db, _user(viewer) or viewer.user, lat, lng)


class SaplingOrderIn(BaseModel):
    product_id: uuid.UUID
    qty: int = Field(ge=1, le=200)
    delivery_address: str | None = Field(default=None, max_length=500)


@router.post("/saplings/orders", operation_id="saplings_order")
async def sapling_order(body: SaplingOrderIn, db: DB, user: FullUser) -> dict:
    PAY.require_gateway()
    o = await ST.create_sapling_order(db, user, body.product_id, body.qty, body.delivery_address)
    url = await PAY.start_checkout(
        db,
        "sapling",
        o,
        product_name=o.meta.get("name", "Saplings"),
        category="Saplings",
        customer=await ST.profile_for(db, user),
    )
    return {**ST.sapling_order_out(o), "payment_url": url}


@router.get("/saplings/orders/{order_id}/invoice.pdf", operation_id="saplings_invoice", response_class=Response)
async def sapling_invoice(order_id: uuid.UUID, db: DB, user: FullUser) -> Response:
    o = await db.get(SaplingOrder, order_id)
    inv = (await db.execute(select(Invoice).where(Invoice.order_id == order_id))).scalar_one_or_none()
    if o is None or o.user_id != user.id or inv is None:
        raise not_found("invoice.not_found", "Invoice not found")
    d = {
        "number": inv.number,
        "created_at": inv.created_at.isoformat(),
        "subtotal": inv.subtotal,
        "vat_rate": inv.vat_rate,
        "vat": inv.vat,
        "total": inv.total,
        "currency": inv.currency,
    }
    pdf = REP.invoice_pdf(
        d,
        {"name": user.display_name},
        [
            {
                "name": o.meta.get("name", "Saplings"),
                "qty": o.qty,
                "unit_price": o.amount_bdt / o.qty,
                "amount": o.amount_bdt,
            }
        ],
        estimate=False,
    )
    return _pdf(pdf, f"{inv.number}.pdf")


# ─────────────────────────── partner portal (S11–S13) ───────────────────────────


class ProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    category: str = Field(max_length=10)
    emoji: str | None = Field(default=None, max_length=8)
    photo_url: str | None = Field(default=None, max_length=500)
    points_price: int = Field(gt=0, le=1_000_000)
    declared_value_bdt: float = Field(gt=0, le=10_000_000)
    stock: int = Field(ge=0, le=1_000_000)
    fulfilment: str = Field(pattern="^(pickup|delivery)$")
    delivery_area: str | None = Field(default=None, max_length=200)
    terms: str | None = Field(default=None, max_length=1000)
    monthly_limit: int = Field(default=2, ge=1, le=20)


class ProductPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    points_price: int | None = Field(default=None, gt=0, le=1_000_000)
    declared_value_bdt: float | None = Field(default=None, gt=0, le=10_000_000)
    stock: int | None = Field(default=None, ge=0, le=1_000_000)
    active: bool | None = None
    terms: str | None = Field(default=None, max_length=1000)


@router.get("/partner/me", operation_id="partner_me")
async def partner_me(db: DB, viewer: ViewerDep) -> dict:
    """The store partner this person works for, or null (no 403, so the app can decide what to show)."""
    user = _user(viewer)
    if user is None:
        return {"partner": None}
    try:
        p = await ST.my_partner(db, user)
    except AppError:
        return {"partner": None}
    return {"partner": ST.partner_out(p)}


@router.get("/partner/products", operation_id="partner_products")
async def partner_products(db: DB, user: FullUser) -> dict:
    p = await ST.my_partner(db, user)
    rows = (
        (await db.execute(select(Product).where(Product.partner_id == p.id).order_by(Product.created_at.desc())))
        .scalars()
        .all()
    )
    lo_hi = {"points_per_bdt": settings.points_per_bdt, "tolerance": settings.points_price_tolerance}
    return {
        "partner": ST.partner_out(p),
        "products": [await ST.product_out(db, x, user, owner=True) for x in rows],
        "price_rule": lo_hi,
    }


@router.post("/partner/products", operation_id="partner_product_add")
async def partner_product_add(body: ProductIn, db: DB, user: FullUser) -> dict:
    p = await ST.my_partner(db, user)
    pr = await ST.upsert_product(db, p, body.model_dump())
    return await ST.product_out(db, pr, user, owner=True)


@router.patch("/partner/products/{product_id}", operation_id="partner_product_patch")
async def partner_product_patch(product_id: uuid.UUID, body: ProductPatch, db: DB, user: FullUser) -> dict:
    p = await ST.my_partner(db, user)
    pr = await ST.upsert_product(db, p, body.model_dump(exclude_unset=True), product_id)
    return await ST.product_out(db, pr, user, owner=True)


class OutletIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    address: str | None = Field(default=None, max_length=300)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


def _outlet(o: PartnerOutlet) -> dict:
    return {
        "id": str(o.id),
        "name": o.name,
        "address": o.address,
        "location": {"lat": o.lat, "lng": o.lng} if o.lat is not None and o.lng is not None else None,
    }


@router.get("/partner/outlets", operation_id="partner_outlets")
async def partner_outlets(db: DB, user: FullUser) -> list[dict]:
    """S11: the pickup points vouchers can be collected at."""
    p = await ST.my_partner(db, user)
    rows = (
        await db.execute(select(PartnerOutlet).where(PartnerOutlet.partner_id == p.id).order_by(PartnerOutlet.name))
    ).scalars()
    return [_outlet(o) for o in rows]


@router.post("/partner/outlets", operation_id="partner_outlet_add")
async def partner_outlet_add(body: OutletIn, db: DB, user: FullUser) -> dict:
    p = await ST.my_partner(db, user)
    n = (await db.execute(select(PartnerOutlet.id).where(PartnerOutlet.partner_id == p.id))).all()
    if len(n) >= 50:
        raise AppError(409, "partner.outlet_limit", "A partner can list up to 50 outlets")
    o = PartnerOutlet(
        partner_id=p.id,
        name=body.name.strip(),
        address=(body.address or "").strip() or None,
        lat=body.lat,
        lng=body.lng,
    )
    db.add(o)
    await db.commit()
    return _outlet(o)


@router.delete("/partner/outlets/{outlet_id}", operation_id="partner_outlet_delete", status_code=204)
async def partner_outlet_delete(outlet_id: uuid.UUID, db: DB, user: FullUser) -> Response:
    p = await ST.my_partner(db, user)
    o = await db.get(PartnerOutlet, outlet_id)
    if o is None or o.partner_id != p.id:
        raise not_found("partner.outlet_not_found", "Outlet not found")
    await db.delete(o)
    await db.commit()
    return Response(status_code=204)


@router.get("/partner/redemptions", operation_id="partner_redemptions")
async def partner_redemptions(db: DB, user: FullUser) -> list[dict]:
    return await ST.partner_redemptions(db, await ST.my_partner(db, user))


class CollectIn(BaseModel):
    outlet_id: uuid.UUID | None = None


@router.post("/partner/vouchers/{code}/collect", operation_id="partner_collect")
async def partner_collect(code: str, body: CollectIn, db: DB, user: FullUser) -> dict:
    return await ST.collect(db, await ST.my_partner(db, user), user, code, body.outlet_id)


@router.post("/partner/redemptions/{redemption_id}/delivered", operation_id="partner_delivered")
async def partner_delivered(redemption_id: uuid.UUID, db: DB, user: FullUser) -> dict:
    return await ST.mark_delivered(db, await ST.my_partner(db, user), redemption_id)


async def _report_pdf(db, company: Company | None, partner: Partner | None) -> bytes:
    ov = (
        await CO.overview(db, company)
        if company
        else {
            "trees_funded": 0,
            "trees_allocated": 0,
            "trees_alive": 0,
            "survival_rate": None,
            "people_reached": 0,
            "co2e_estimated_t": 0.0,
            "co2e_certified_t": 0.0,
        }
    )
    trees = []
    if company is not None:
        orders = select(PackageOrder.id).where(PackageOrder.company_id == company.id)
        rows = (
            (
                await db.execute(
                    select(Tree)
                    .join(TreeAllocation, TreeAllocation.tree_id == Tree.id)
                    .where(TreeAllocation.order_id.in_(orders))
                    .limit(6)
                )
            )
            .scalars()
            .all()
        )
        for t in rows:
            pid = (
                await db.execute(
                    select(TreeCheck.photo_id)
                    .where(TreeCheck.tree_id == t.id, TreeCheck.photo_id.is_not(None))
                    .order_by(TreeCheck.created_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none() or t.photo_id
            ph = await db.get(Photo, pid) if pid else None
            trees.append(
                {
                    "species": t.species_id,
                    "planted": t.planted_at.isoformat(),
                    "lat": round(t.lat or 0, 3),
                    "lng": round(t.lng or 0, 3),
                    "photo_path": ph.path_thumb if ph else None,
                }
            )
    red = 0
    if partner is not None:
        from sqlalchemy import func

        red = (
            await db.execute(
                select(func.count())
                .select_from(Redemption)
                .join(Product, Product.id == Redemption.product_id)
                .where(Product.partner_id == partner.id)
            )
        ).scalar_one()
    name = company.name if company else (partner.name if partner else "Atmos X")
    return REP.impact_report_pdf({"name": name}, ov, trees, redemptions=int(red))


@router.get("/partner/report", operation_id="partner_report", response_class=Response)
async def partner_report(db: DB, user: FullUser) -> Response:
    p = await ST.my_partner(db, user)
    c = await db.get(Company, p.company_id) if p.company_id else None
    return _pdf(await _report_pdf(db, c, p), "atmos-x-impact-report.pdf")


# ─────────────────────────── company (M1–M13) ───────────────────────────


@router.post("/company/register", operation_id="company_register")
async def company_register(
    request: Request,
    db: DB,
    user: FullUser,
    name: Annotated[str, Form(min_length=2, max_length=160)],
    trade_licence: Annotated[str, Form(min_length=2, max_length=80)],
    tin_bin: Annotated[str, Form(min_length=2, max_length=40)],
    contact_name: Annotated[str, Form(min_length=2, max_length=120)],
    contact_email: Annotated[str, Form(min_length=3, max_length=320)],
    industry: Annotated[str, Form(min_length=2, max_length=60)],
    contact_phone: Annotated[str | None, Form(max_length=24)] = None,
    trade_licence_doc: Annotated[UploadFile | None, File()] = None,
    tin_bin_doc: Annotated[UploadFile | None, File()] = None,
    other_doc: Annotated[UploadFile | None, File()] = None,
) -> dict:
    docs = []
    for kind, f in (("trade_licence", trade_licence_doc), ("tin_bin", tin_bin_doc), ("other", other_doc)):
        if f is not None:
            data = await f.read(CO.DOC_MAX + 1)
            if data:
                docs.append((kind, data, (f.content_type or "").lower()))
    c = await CO.register(
        db,
        user,
        {
            "name": name.strip(),
            "trade_licence": trade_licence.strip(),
            "tin_bin": tin_bin.strip(),
            "contact_name": contact_name.strip(),
            "contact_email": contact_email.strip(),
            "contact_phone": contact_phone,
            "industry": industry.strip(),
        },
        docs,
    )
    return CO.company_out(c, await CO.documents(db, c))


@router.get("/company/me", operation_id="company_me")
async def company_me(db: DB, user: FullUser) -> dict:
    c = await CO.company_of(db, user)
    if c is None:
        return {"company": None}
    return {"company": CO.company_out(c, await CO.documents(db, c))}


class CompanyPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    trade_licence: str | None = Field(default=None, max_length=80)
    tin_bin: str | None = Field(default=None, max_length=40)
    contact_name: str | None = Field(default=None, max_length=120)
    contact_email: str | None = Field(default=None, max_length=320)
    contact_phone: str | None = Field(default=None, max_length=24)
    industry: str | None = Field(default=None, max_length=60)


@router.patch("/company/me", operation_id="company_patch")
async def company_patch(body: CompanyPatch, db: DB, user: FullUser) -> dict:
    c = await CO.patch(db, await CO.require_company(db, user), body.model_dump(exclude_unset=True))
    return {"company": CO.company_out(c, await CO.documents(db, c))}


class EmissionsIn(BaseModel):
    year: int = Field(ge=2000, le=2100)
    tonnes_co2e: float = Field(ge=0, le=1e9)
    offset_target_t: float | None = Field(default=None, ge=0, le=1e9)
    source_note: str | None = Field(default=None, max_length=300)


@router.get("/company/emissions", operation_id="company_emissions")
async def company_emissions(db: DB, user: FullUser) -> list[dict]:
    return await CO.emissions(db, await CO.require_company(db, user))


@router.patch("/company/emissions", operation_id="company_emissions_set")
async def company_emissions_set(body: EmissionsIn, db: DB, user: FullUser) -> list[dict]:
    return await CO.set_emissions(
        db, await CO.require_company(db, user), body.year, body.tonnes_co2e, body.offset_target_t, body.source_note
    )


@router.get("/company/packages", operation_id="company_packages")
async def company_packages(db: DB) -> list[dict]:
    return await CO.packages(db)


@router.get("/company/overview", operation_id="company_overview")
async def company_overview(db: DB, user: FullUser) -> dict:
    c = await CO.require_company(db, user, approved=True)
    orders = (
        (
            await db.execute(
                select(PackageOrder).where(PackageOrder.company_id == c.id).order_by(PackageOrder.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return {**await CO.overview(db, c), "orders": [CO.order_out(o) for o in orders]}


class OrderIn(BaseModel):
    package: str = Field(pattern="^(tree_impact|store_listing|carbon_credits)$")
    qty: int = Field(ge=1, le=100000)
    payment_method: str = Field(default="sslcommerz", pattern="^(sslcommerz|bank_transfer)$")


@router.post("/company/orders", operation_id="company_order")
async def company_order(body: OrderIn, db: DB, user: FullUser) -> dict:
    c = await CO.require_company(db, user, approved=True)
    if body.payment_method == "sslcommerz":
        PAY.require_gateway()
    o = await CO.create_order(db, c, body.package, body.qty, body.payment_method)
    url = None
    if o.payment_method == "sslcommerz":
        url = await PAY.start_checkout(
            db,
            "package",
            o,
            product_name=f"Atmos X {o.package} × {o.qty}",
            category="CSR",
            customer={"name": c.contact_name, "email": c.contact_email, "phone": c.contact_phone},
        )
    return {**CO.order_out(o), "payment_url": url}


@router.get("/company/invoices", operation_id="company_invoices")
async def company_invoices(db: DB, user: FullUser) -> list[dict]:
    return await CO.invoices(db, await CO.require_company(db, user))


@router.get("/company/invoices/{invoice_id}.pdf", operation_id="company_invoice_pdf", response_class=Response)
async def company_invoice_pdf(invoice_id: uuid.UUID, db: DB, user: FullUser) -> Response:
    c = await CO.require_company(db, user)
    inv = await db.get(Invoice, invoice_id)
    if inv is None or inv.company_id != c.id:
        raise not_found("invoice.not_found", "Invoice not found")
    o = await db.get(PackageOrder, inv.order_id)
    d = {
        "number": inv.number,
        "created_at": inv.created_at.isoformat(),
        "subtotal": inv.subtotal,
        "vat_rate": inv.vat_rate,
        "vat": inv.vat,
        "total": inv.total,
        "currency": inv.currency,
    }
    names = {
        "tree_impact": "Tree impact package (planting and 3 years of care)",
        "store_listing": "Points store listing (1 year)",
        "carbon_credits": "Certified carbon credits (tonnes CO₂e, retired)",
    }
    pdf = REP.invoice_pdf(
        d,
        {"name": c.name, "trade_licence": c.trade_licence, "tin_bin": c.tin_bin},
        [{"name": names.get(o.package, o.package), "qty": o.qty, "unit_price": o.unit_price, "amount": o.subtotal}],
        estimate=o.package == "tree_impact",
    )
    return _pdf(pdf, f"{inv.number}.pdf")


@router.get("/company/report.pdf", operation_id="company_report", response_class=Response)
async def company_report(db: DB, user: FullUser) -> Response:
    c = await CO.require_company(db, user, approved=True)
    p = (await db.execute(select(Partner).where(Partner.company_id == c.id))).scalar_one_or_none()
    return _pdf(await _report_pdf(db, c, p), "atmos-x-impact-report.pdf")


@router.get("/company/certificates", operation_id="company_certificates")
async def company_certificates(db: DB, user: FullUser) -> list[dict]:
    return await CO.certificates(db, await CO.require_company(db, user))


@router.get(
    "/company/certificates/{retirement_id}.pdf", operation_id="company_certificate_pdf", response_class=Response
)
async def company_certificate_pdf(retirement_id: uuid.UUID, db: DB, user: FullUser) -> Response:
    c = await CO.require_company(db, user)
    r = await db.get(Retirement, retirement_id)
    if r is None or r.company_id != c.id:
        raise not_found("certificate.not_found", "Certificate not found")
    lot = await db.get(CreditLot, r.lot_id)
    return _pdf(
        REP.retirement_pdf({"name": c.name}, CO.lot_out(lot), r.serial_from, r.serial_to), "retirement-certificate.pdf"
    )


# ─────────────────────────── payments (M14) ───────────────────────────


async def _form(request: Request) -> dict:
    try:
        f = await request.form()
        return {k: (v if isinstance(v, str) else "") for k, v in f.items()}
    except Exception:  # noqa: BLE001
        return {}


def _back(kind: str | None, outcome: str) -> RedirectResponse:
    base = settings.public_web_origin.rstrip("/")
    to = (
        f"{base}/app/company?payment={outcome}"
        if kind == "package"
        else f"{base}/app/store?tab=saplings&payment={outcome}"
    )
    return RedirectResponse(to, status_code=303)


@router.post("/payments/sslcommerz/{source}", operation_id="payments_sslcommerz", include_in_schema=False)
async def sslcommerz_callback(source: str, request: Request, db: DB):
    if source not in ("success", "fail", "cancel", "ipn"):
        raise not_found()
    kind, outcome = await PAY.handle_callback(db, source, await _form(request))
    if source == "ipn":
        return {"ok": outcome in ("paid", "already"), "outcome": outcome}
    return _back(kind, outcome)


# ─────────────────────────── admin (M2, M14, M16) ───────────────────────────


@router.get("/admin/companies", operation_id="admin_companies")
async def admin_companies(
    db: DB, admin: Admin, status: str = Query("pending", pattern="^(pending|approved|rejected)$")
) -> list[dict]:
    rows = (
        (await db.execute(select(Company).where(Company.status == status).order_by(Company.created_at))).scalars().all()
    )
    return [CO.company_out(c, await CO.documents(db, c)) for c in rows]


@router.get(
    "/admin/companies/{company_id}/documents/{doc_id}", operation_id="admin_company_doc", response_class=FileResponse
)
async def admin_company_doc(company_id: uuid.UUID, doc_id: uuid.UUID, db: DB, admin: Admin):
    from ..storage import storage

    d = await db.get(CompanyDocument, doc_id)
    if d is None or d.company_id != company_id or not storage().exists(d.path):
        raise not_found("document.not_found", "Document not found")
    return FileResponse(storage().path(d.path), media_type=d.mime, headers={"Cache-Control": "private, no-store"})


class ReviewIn(BaseModel):
    approve: bool = True
    note: str | None = Field(default=None, max_length=500)


@router.post("/admin/companies/{company_id}/approve", operation_id="admin_company_approve")
async def admin_company_approve(company_id: uuid.UUID, body: ReviewIn, db: DB, admin: Admin) -> dict:
    return CO.company_out(await CO.admin_review(db, admin, company_id, body.approve, body.note))


class LotIn(BaseModel):
    tree_ids: list[uuid.UUID] = Field(min_length=1, max_length=10000)
    tonnes: float = Field(gt=0, le=1e6)
    project_id: str | None = Field(default=None, max_length=80)


@router.get("/admin/credit-lots", operation_id="admin_lots")
async def admin_lots(db: DB, admin: Admin) -> list[dict]:
    return [
        CO.lot_out(x)
        for x in (await db.execute(select(CreditLot).order_by(CreditLot.created_at.desc()))).scalars().all()
    ]


@router.post("/admin/credit-lots", operation_id="admin_lot_create")
async def admin_lot_create(body: LotIn, db: DB, admin: Admin) -> dict:
    return CO.lot_out(await CO.admin_create_lot(db, body.tree_ids, body.tonnes, body.project_id))


class CertifyIn(BaseModel):
    standard: str = Field(min_length=2, max_length=40)
    registry_project_id: str = Field(min_length=2, max_length=80)
    auditor: str = Field(min_length=2, max_length=120)


@router.post("/admin/credit-lots/{lot_id}/certify", operation_id="admin_lot_certify")
async def admin_lot_certify(lot_id: uuid.UUID, body: CertifyIn, db: DB, admin: Admin) -> dict:
    return CO.lot_out(await CO.admin_certify(db, admin, lot_id, body.standard, body.registry_project_id, body.auditor))


@router.get("/admin/orders", operation_id="admin_orders")
async def admin_orders(db: DB, admin: Admin, status: str = Query("awaiting_transfer")) -> list[dict]:
    rows = (
        (await db.execute(select(PackageOrder).where(PackageOrder.status == status).order_by(PackageOrder.created_at)))
        .scalars()
        .all()
    )
    return [{**CO.order_out(o), "company_id": str(o.company_id), "tran_id": o.tran_id} for o in rows]


@router.post("/admin/orders/{order_id}/confirm-transfer", operation_id="admin_confirm_transfer")
async def admin_confirm_transfer(order_id: uuid.UUID, db: DB, admin: Admin) -> dict:
    return CO.order_out(await CO.admin_confirm_transfer(db, admin, order_id))


@router.post("/admin/allocate", operation_id="admin_allocate")
async def admin_allocate(db: DB, admin: Admin) -> dict:
    n = await CO.allocate(db)
    await db.commit()
    return {"allocated": n}
