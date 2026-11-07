"""Points store, saplings, company marketplace, payments and credit lots (§6.9–§6.10)."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
from sqlalchemy import select, text, update
from sqlalchemy.exc import DBAPIError

from app.config import settings
from app.models import (
    CreditLot,
    Invoice,
    NurseryPartner,
    NurseryProduct,
    Partner,
    PartnerMember,
    PartnerOutlet,
    PayoutLedger,
    PointsLedger,
    Product,
    User,
    Voucher,
)
from app.services import points as PTS
from tests.conftest import make_client, signup
from tests.test_act import jpeg, multipart, plant

SSL = "https://sandbox.sslcommerz.com"


@pytest.fixture(autouse=True)
def gateway(monkeypatch):
    monkeypatch.setattr(settings, "sslcommerz_store_id", "teststore")
    monkeypatch.setattr(settings, "sslcommerz_store_password", "testpass")
    monkeypatch.setattr(settings, "sslcommerz_sandbox", True)


def mock_gateway(amount_for: dict):
    """Session init succeeds; validation answers VALID with the amount registered for each val_id."""
    respx.post(f"{SSL}/gwprocess/v4/api.php").mock(
        return_value=httpx.Response(
            200, json={"status": "SUCCESS", "GatewayPageURL": f"{SSL}/EasyCheckOut/testcde", "sessionkey": "k"}
        )
    )

    def validate(request):
        val_id = request.url.params["val_id"]
        tran_id, amount = amount_for.get(val_id, ("x", 0))
        if tran_id == "x":
            return httpx.Response(200, json={"status": "INVALID_TRANSACTION"})
        return httpx.Response(
            200,
            json={
                "status": "VALID",
                "tran_id": tran_id,
                "amount": f"{amount:.2f}",
                "currency": "BDT",
                "val_id": val_id,
            },
        )

    respx.get(f"{SSL}/validator/api/validationserverAPI.php").mock(side_effect=validate)


async def form_post(c, path, data):
    ct = c.headers.pop("content-type", None)
    try:
        return await c.post(path, data=data, follow_redirects=False)
    finally:
        if ct:
            c.headers["content-type"] = ct


async def partner_with(db, *, stock=5, price=400, value=200.0, fulfilment="pickup", limit=2, member: str | None = None):
    p = Partner(name="Pilot Grocer", status="active", is_pilot=True)
    db.add(p)
    await db.flush()
    db.add(PartnerOutlet(partner_id=p.id, name="Main outlet"))
    pr = Product(
        partner_id=p.id,
        name="Rice 2 kg",
        category="food",
        points_price=price,
        declared_value_bdt=value,
        stock=stock,
        fulfilment=fulfilment,
        monthly_limit=limit,
    )
    db.add(pr)
    if member:
        db.add(PartnerMember(partner_id=p.id, user_id=uuid.UUID(member), role="admin"))
    await db.commit()
    return p, pr


async def test_redeem_spends_only_spendable_points_and_issues_a_voucher(client, client2, db, seeded):
    u = await signup(client)
    uid = uuid.UUID(u["id"])
    staff = await signup(client2, "staff@example.org", "Staff")
    p, pr = await partner_with(db, member=staff["id"])
    await PTS.earn(db, uid, 500, rule_id="PT1", source_type="tree", source_id="t1", state="pending")
    await db.commit()
    short = await client.post(f"/api/v1/store/products/{pr.id}/redeem", json={})
    assert short.status_code == 409 and short.json()["code"] == "points.insufficient"  # pending points can't be spent
    await PTS.earn(db, uid, 450, rule_id="PT3", source_type="tree", source_id="t1", state="spendable")
    await db.commit()
    listing = (await client.get("/api/v1/store/products", params={"filter": "can_afford"})).json()
    assert (
        [x["id"] for x in listing["products"]] == [str(pr.id)]
        and listing["points"]["spendable"] == 450
        and listing["pilot"]
    )
    r = await client.post(f"/api/v1/store/products/{pr.id}/redeem", json={})
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["status"] == "issued" and len(order["voucher"]["code"]) == 10
    assert (await PTS.balances(db, uid)) == {"pending": 500, "spendable": 50, "spent": 400, "revoked": 0}
    mine = (await client.get("/api/v1/orders/mine")).json()["redemptions"]
    assert mine[0]["voucher"]["code"] == order["voucher"]["code"]
    # The partner collects it once.
    coll = await client2.post(f"/api/v1/partner/vouchers/{order['voucher']['code'].lower()}/collect", json={})
    assert coll.status_code == 200 and coll.json()["status"] == "collected"
    again = await client2.post(f"/api/v1/partner/vouchers/{order['voucher']['code']}/collect", json={})
    assert again.status_code == 409 and again.json()["code"] == "voucher.used"
    assert (
        await client.post(f"/api/v1/partner/vouchers/{order['voucher']['code']}/collect", json={})
    ).status_code == 403


async def test_no_oversell_monthly_limits_and_concurrent_spends(client, db, seeded):
    u = await signup(client)
    uid = uuid.UUID(u["id"])
    _, pr = await partner_with(db, stock=1, price=400, value=200, limit=5)
    await PTS.earn(db, uid, 2000, rule_id="PT3", source_type="tree", source_id="a", state="spendable")
    await db.commit()
    assert (await client.post(f"/api/v1/store/products/{pr.id}/redeem", json={})).status_code == 200
    sold = await client.post(f"/api/v1/store/products/{pr.id}/redeem", json={})
    assert sold.status_code == 409 and sold.json()["code"] == "store.sold_out"
    # Two redeems at once with points for only one: exactly one succeeds.
    _, pr2 = await partner_with(db, stock=10, price=400, value=200, limit=5)
    async with make_client() as c2:
        c2.cookies = client.cookies
        bal = await PTS.balances(db, uid)
        await PTS.spend(db, uid, bal["spendable"] - 500, source_type="test", source_id="burn")
        await db.commit()
        a, b = await asyncio.gather(
            client.post(f"/api/v1/store/products/{pr2.id}/redeem", json={}),
            c2.post(f"/api/v1/store/products/{pr2.id}/redeem", json={}),
        )
    codes = sorted([a.status_code, b.status_code])
    assert codes == [200, 409]
    assert (await PTS.balances(db, uid))["spendable"] == 100
    # Per-product monthly limit
    _, pr3 = await partner_with(db, stock=10, price=60, value=30, limit=1)
    await PTS.earn(db, uid, 1000, rule_id="PT4", source_type="tree_y1", source_id="b", state="spendable")
    await db.commit()
    assert (await client.post(f"/api/v1/store/products/{pr3.id}/redeem", json={})).status_code == 200
    lim = await client.post(f"/api/v1/store/products/{pr3.id}/redeem", json={})
    assert lim.status_code == 429 and lim.json()["code"] == "store.product_limit"


async def test_delivery_needs_an_address_and_vouchers_expire(client, client2, db, seeded):
    u = await signup(client)
    staff = await signup(client2, "staff@example.org", "Staff")
    partner, pr = await partner_with(db, fulfilment="delivery", member=staff["id"])
    await PTS.earn(db, uuid.UUID(u["id"]), 1000, rule_id="PT3", source_type="tree", source_id="c", state="spendable")
    await db.commit()
    bad = await client.post(f"/api/v1/store/products/{pr.id}/redeem", json={})
    assert bad.status_code == 400 and bad.json()["code"] == "store.address"
    ok = await client.post(
        f"/api/v1/store/products/{pr.id}/redeem", json={"delivery_address": "House 3, Road 2, Mohammadpur"}
    )
    assert ok.json()["status"] == "processing" and ok.json()["voucher"] is None
    pickup = Product(
        partner_id=partner.id,
        name="Soap",
        category="home",
        points_price=400,
        declared_value_bdt=200,
        stock=5,
        fulfilment="pickup",
    )
    db.add(pickup)
    await db.commit()
    v = (await client.post(f"/api/v1/store/products/{pickup.id}/redeem", json={})).json()["voucher"]["code"]
    await db.execute(update(Voucher).where(Voucher.code == v).values(expires_at=datetime.now(UTC) - timedelta(days=1)))
    await db.commit()
    exp = await client2.post(f"/api/v1/partner/vouchers/{v}/collect", json={})
    assert exp.status_code == 409 and exp.json()["code"] == "voucher.expired"


async def test_partner_prices_stay_within_the_band(client, db, seeded):
    staff = await signup(client, "staff@example.org", "Staff")
    assert (await client.get("/api/v1/partner/me")).json() == {"partner": None}
    await partner_with(db, member=staff["id"])
    assert (await client.get("/api/v1/partner/me")).json()["partner"]["name"]
    body = {
        "name": "Tote bag",
        "category": "home",
        "points_price": 50,
        "declared_value_bdt": 100,
        "stock": 10,
        "fulfilment": "pickup",
    }
    bad = await client.post("/api/v1/partner/products", json=body)
    assert bad.status_code == 400 and bad.json()["code"] == "partner.price_band"
    ok = await client.post("/api/v1/partner/products", json={**body, "points_price": 210})
    assert ok.status_code == 200 and ok.json()["points_price"] == 210
    assert ok.json()["price_band"] == [150, 250] and ok.json()["active"] is True
    mine = (await client.get("/api/v1/partner/products")).json()
    assert mine["products"][0]["declared_value_bdt"] == 100
    off = await client.patch(f"/api/v1/partner/products/{ok.json()['id']}", json={"active": False})
    assert off.json()["active"] is False
    report = await client.get("/api/v1/partner/report")
    assert report.status_code == 200 and report.content[:4] == b"%PDF"


@respx.mock
async def test_saplings_checkout_is_validated_and_idempotent(client, db, seeded):
    u = await signup(client)
    n = NurseryPartner(name="Ring Road Nursery", lat=23.76, lng=90.36, commission_pct=10)
    db.add(n)
    await db.flush()
    np_ = NurseryProduct(nursery_id=n.id, name="Neem sapling", species_id="neem", price_bdt=100, stock=20)
    db.add(np_)
    await db.commit()
    amounts = {}
    mock_gateway(amounts)
    listed = (await client.get("/api/v1/saplings/products", params={"lat": 23.76, "lng": 90.36})).json()
    assert listed["products"][0]["name"] == "Neem sapling" and listed["payments"]
    o = (await client.post("/api/v1/saplings/orders", json={"product_id": str(np_.id), "qty": 3})).json()
    assert o["payment_url"].startswith(SSL) and o["total_bdt"] == 345.0 and o["status"] == "unpaid"
    tran = (await db.execute(text("SELECT tran_id FROM sapling_orders"))).scalar_one()
    # A forged success with the wrong amount is not accepted.
    amounts["v-bad"] = (tran, 1.0)
    r = await form_post(
        client, "/api/v1/payments/sslcommerz/success", {"tran_id": tran, "val_id": "v-bad", "status": "VALID"}
    )
    assert r.status_code == 303 and "payment=invalid" in r.headers["location"]
    amounts["v-ok"] = (tran, 345.0)
    r = await form_post(
        client, "/api/v1/payments/sslcommerz/success", {"tran_id": tran, "val_id": "v-ok", "status": "VALID"}
    )
    assert "payment=paid" in r.headers["location"]
    ipn = await form_post(
        client, "/api/v1/payments/sslcommerz/ipn", {"tran_id": tran, "val_id": "v-ok", "status": "VALID"}
    )
    assert ipn.json() == {"ok": True, "outcome": "already"}
    await db.refresh(np_)
    assert np_.stock == 17
    inv = (await db.execute(select(Invoice))).scalars().all()
    assert len(inv) == 1 and inv[0].total == 345.0 and inv[0].vat == 45.0
    ledger = sorted((x.payee_type, x.state, x.amount) for x in (await db.execute(select(PayoutLedger))).scalars().all())
    assert ledger == [("nursery", "held", 270.0), ("pool", "released", 30.0)]
    mine = (await client.get("/api/v1/orders/mine")).json()["saplings"]
    assert mine[0]["status"] == "paid"
    pdf = await client.get(f"/api/v1/saplings/orders/{mine[0]['id']}/invoice.pdf")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    assert not (await db.execute(select(PointsLedger).where(PointsLedger.user_id == uuid.UUID(u["id"])))).first()  # M21


async def register_company(c, name="Acme Cement Ltd"):
    ct = c.headers.pop("content-type", None)
    try:
        return await c.post(
            "/api/v1/company/register",
            data={
                "name": name,
                "trade_licence": "TRAD/DSCC/123",
                "tin_bin": "123456789012",
                "contact_name": "R. Karim",
                "contact_email": "csr@example.org",
                "industry": "cement",
            },
            files=[
                ("trade_licence_doc", ("licence.pdf", b"%PDF-1.4 test", "application/pdf")),
                ("tin_bin_doc", ("bin.png", jpeg(40), "image/png")),
            ],
        )
    finally:
        if ct:
            c.headers["content-type"] = ct


@respx.mock
async def test_company_flow_trees_held_then_released_and_no_points(client, client2, db, seeded):
    amounts = {}
    mock_gateway(amounts)
    await signup(client, "csr@example.org", "CSR Lead")
    r = await register_company(client)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending" and len(r.json()["documents"]) == 2
    blocked = await client.post("/api/v1/company/orders", json={"package": "tree_impact", "qty": 2})
    assert blocked.status_code == 403 and blocked.json()["code"] == "company.not_approved"
    await signup(client2, "admin@example.org", "Admin")
    await db.execute(update(User).where(User.email == "admin@example.org").values(role="admin"))
    await db.commit()
    queue = (await client2.get("/api/v1/admin/companies")).json()
    assert queue[0]["name"] == "Acme Cement Ltd"
    doc = await client2.get(f"/api/v1/admin/companies/{queue[0]['id']}/documents/{queue[0]['documents'][0]['id']}")
    assert doc.status_code == 200
    assert (await client2.post(f"/api/v1/admin/companies/{queue[0]['id']}/approve", json={"approve": True})).json()[
        "status"
    ] == "approved"
    pk = {p["id"]: p for p in (await client.get("/api/v1/company/packages")).json()}
    assert pk["carbon_credits"]["enabled"] is False and pk["tree_impact"]["note"] == "estimate_not_offset"
    assert pk["tree_impact"]["vat_rate"] == 0.15 and pk["tree_impact"]["bank_transfer_min"] > 0
    assert (
        await client.patch(
            "/api/v1/company/emissions", json={"year": 2025, "tonnes_co2e": 12000, "offset_target_t": 500}
        )
    ).json()[0]["label"] == "company_reported"
    small = await client.post(
        "/api/v1/company/orders", json={"package": "tree_impact", "qty": 2, "payment_method": "bank_transfer"}
    )
    assert small.status_code == 400 and small.json()["code"] == "company.transfer_min"
    o = (await client.post("/api/v1/company/orders", json={"package": "tree_impact", "qty": 2})).json()
    assert o["payment_url"] and o["total"] == 3450.0
    tran = (await db.execute(text("SELECT tran_id FROM package_orders"))).scalar_one()
    amounts["c-ok"] = (tran, 3450.0)
    # One verified tree exists before payment; it is allocated on payment.
    async with make_client() as pc:
        await signup(pc, "planter@example.org", "Planter")
        await multipart(pc, "/api/v1/actions", plant(1), jpeg(41))
    r = await form_post(client, "/api/v1/payments/sslcommerz/success", {"tran_id": tran, "val_id": "c-ok"})
    assert "/app/company?payment=paid" in r.headers["location"]
    ov = (await client.get("/api/v1/company/overview")).json()
    assert (
        ov["trees_funded"] == 2
        and ov["trees_allocated"] == 1
        and ov["people_reached"] == 1
        and ov["note"] == "estimate_not_offset"
    )
    held = sum(
        x.amount
        for x in (await db.execute(select(PayoutLedger).where(PayoutLedger.payee_type == "pool"))).scalars().all()
    )
    released = sum(
        x.amount
        for x in (await db.execute(select(PayoutLedger).where(PayoutLedger.payee_type == "planter"))).scalars().all()
    )
    assert held == 1500.0 and released == 1500.0  # one tree's money released, one still held
    async with make_client() as pc2:
        await signup(pc2, "planter2@example.org", "Planter Two")
        await multipart(pc2, "/api/v1/actions", plant(1), jpeg(42))
    assert (await client2.post("/api/v1/admin/allocate")).json()["allocated"] == 1
    # M21: paying created no points for the company's people.
    csr = (await db.execute(select(User).where(User.email == "csr@example.org"))).scalar_one()
    assert not (await db.execute(select(PointsLedger).where(PointsLedger.user_id == csr.id))).first()
    inv = (await client.get("/api/v1/company/invoices")).json()
    pdf = await client.get(f"/api/v1/company/invoices/{inv[0]['id']}.pdf")
    assert pdf.content[:4] == b"%PDF" and inv[0]["vat"] == 450.0
    rep = await client.get("/api/v1/company/report.pdf")
    assert rep.status_code == 200 and rep.content[:4] == b"%PDF"


@respx.mock
async def test_credits_sell_only_when_certified_and_only_once(client, client2, db, seeded):
    amounts = {}
    mock_gateway(amounts)
    await signup(client, "csr@example.org", "CSR Lead")
    await register_company(client)
    await signup(client2, "admin@example.org", "Admin")
    await db.execute(update(User).where(User.email == "admin@example.org").values(role="admin"))
    await db.commit()
    cid = (await client2.get("/api/v1/admin/companies")).json()[0]["id"]
    await client2.post(f"/api/v1/admin/companies/{cid}/approve", json={"approve": True})
    act = (await multipart(client2, "/api/v1/actions", plant(1), jpeg(43))).json()
    lot = (
        await client2.post(
            "/api/v1/admin/credit-lots",
            json={"tree_ids": [act["trees"][0]["id"]], "tonnes": 1, "project_id": "DHK-GROUP-1"},
        )
    ).json()
    assert lot["state"] == "estimated"
    no = await client.post("/api/v1/company/orders", json={"package": "carbon_credits", "qty": 1})
    assert no.status_code == 409 and no.json()["code"] == "company.credits_unavailable"
    cert = await client2.post(
        f"/api/v1/admin/credit-lots/{lot['id']}/certify",
        json={"standard": "Verra VCS", "registry_project_id": "VCS-0000", "auditor": "Test Auditor"},
    )
    assert cert.json()["state"] == "verified"
    o = (await client.post("/api/v1/company/orders", json={"package": "carbon_credits", "qty": 1})).json()
    tran = (await db.execute(text("SELECT tran_id FROM package_orders"))).scalar_one()
    amounts["k1"] = (tran, o["total"])
    await form_post(client, "/api/v1/payments/sslcommerz/success", {"tran_id": tran, "val_id": "k1"})
    sold = (await db.execute(select(CreditLot))).scalar_one()
    assert sold.state == "retired" and str(sold.sold_to_company_id) == cid
    certs = (await client.get("/api/v1/company/certificates")).json()
    ret = next(c for c in certs if c["kind"] == "retirement_record")
    assert ret["serial_from"].endswith("-000001")
    pdf = await client.get(f"/api/v1/company/certificates/{ret['id']}.pdf")
    assert pdf.content[:4] == b"%PDF"
    again = await client.post("/api/v1/company/orders", json={"package": "carbon_credits", "qty": 1})
    assert again.status_code == 409
    with pytest.raises(DBAPIError):  # the DB itself refuses to resell a retired tonne
        await db.execute(text("UPDATE credit_lots SET sold_to_company_id = NULL, state = 'verified'"))
    await db.rollback()


@respx.mock
async def test_store_listing_package_opens_the_partner_portal(client, client2, db, seeded):
    amounts = {}
    mock_gateway(amounts)
    await signup(client, "csr@example.org", "CSR Lead")
    await register_company(client, "Fresh Foods Ltd")
    await signup(client2, "admin@example.org", "Admin")
    await db.execute(update(User).where(User.email == "admin@example.org").values(role="admin"))
    await db.commit()
    cid = (await client2.get("/api/v1/admin/companies")).json()[0]["id"]
    await client2.post(f"/api/v1/admin/companies/{cid}/approve", json={"approve": True})
    assert (await client.get("/api/v1/partner/products")).status_code == 403
    o = (await client.post("/api/v1/company/orders", json={"package": "store_listing", "qty": 1})).json()
    tran = (await db.execute(text("SELECT tran_id FROM package_orders"))).scalar_one()
    amounts["s1"] = (tran, o["total"])
    await form_post(client, "/api/v1/payments/sslcommerz/fail", {"tran_id": "nope"})
    await form_post(client, "/api/v1/payments/sslcommerz/success", {"tran_id": tran, "val_id": "s1"})
    portal = await client.get("/api/v1/partner/products")
    assert portal.status_code == 200 and portal.json()["partner"]["name"] == "Fresh Foods Ltd"
