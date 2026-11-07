import base64
import json
import time

import httpx
import respx

from app.config import settings
from app.security import SESSION_COOKIE, read_token
from tests.conftest import signup


async def test_register_login_logout_me(client):
    user = await signup(client)
    assert user["role"] == "user" and user["display_name"] == "Nadia"
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 200 and r.json()["email"] == "nadia@example.org"
    # duplicate email
    r = await client.post("/api/v1/auth/register", json={"email": "NADIA@example.org", "password": "another pass"})
    assert r.status_code == 409 and r.json()["code"] == "auth.email_taken"
    await client.post("/api/v1/auth/logout", json={})
    client.cookies.clear()
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    r = await client.post("/api/v1/auth/login", json={"email": "nadia@example.org", "password": "wrong password"})
    assert r.status_code == 401 and r.json()["code"] == "auth.invalid_credentials"
    r = await client.post("/api/v1/auth/login", json={"email": "nadia@example.org", "password": "correct horse"})
    assert r.status_code == 200


async def test_session_cookie_flags(client):
    r = await client.post("/api/v1/auth/register", json={"email": "a@example.org", "password": "12345678"})
    sc = r.headers["set-cookie"]
    assert SESSION_COOKIE in sc and "HttpOnly" in sc and "SameSite=lax" in sc and "Max-Age=2592000" in sc
    assert "Secure" not in sc  # localhost


async def test_short_password_and_bad_email(client):
    r = await client.post("/api/v1/auth/register", json={"email": "a@example.org", "password": "short"})
    assert r.status_code == 400 and r.json()["code"] == "auth.password_short"
    r = await client.post("/api/v1/auth/register", json={"email": "nope", "password": "longenough"})
    assert r.status_code == 400 and r.json()["code"] == "auth.email_invalid"


async def test_guest_then_upgrade_keeps_id_and_profile(client):
    r = await client.post("/api/v1/auth/guest", json={"lang": "bn"})
    guest = r.json()["user"]
    assert guest["role"] == "guest"
    assert "Max-Age=604800" in r.headers["set-cookie"]
    r = await client.patch(
        "/api/v1/me/profile", json={"radius_m": 1000, "home": {"lat": 23.759, "lng": 90.359}, "onboarded": True}
    )
    assert r.status_code == 200
    assert r.json()["radius_m"] == 500  # guests capped at 500 m
    assert r.json()["lang"] == "bn"
    r = await client.post(
        "/api/v1/auth/upgrade", json={"email": "g@example.org", "password": "longenough", "display_name": "Rafi"}
    )
    assert r.status_code == 200, r.text
    up = r.json()["user"]
    assert up["id"] == guest["id"] and up["role"] == "user"
    prof = (await client.get("/api/v1/me/profile")).json()
    assert (
        prof["home"] == {"lat": 23.759, "lng": 90.359} and prof["onboarded"] is True and prof["display_name"] == "Rafi"
    )


async def test_guest_restricted_and_csrf_guard(client):
    r = await client.post("/api/v1/auth/logout", content=b"x", headers={"content-type": "text/plain"})
    assert r.status_code == 415


async def test_otp_flow(client, caplog):
    caplog.set_level("WARNING", logger="atmos.auth")
    r = await client.post("/api/v1/auth/otp/start", json={"phone": "01711-000000"})
    assert r.status_code == 200 and r.json()["phone"] == "+8801711000000" and r.json()["dev_console"] is True
    code = next(rec.data["code"] for rec in caplog.records if getattr(rec, "data", {}).get("code"))
    r = await client.post(
        "/api/v1/auth/otp/verify", json={"phone": "+8801711000000", "code": "000000" if code != "000000" else "111111"}
    )
    assert r.status_code == 400 and r.json()["code"] == "auth.otp_wrong"
    r = await client.post("/api/v1/auth/otp/verify", json={"phone": "+8801711000000", "code": code})
    assert r.status_code == 200 and r.json()["created"] is True
    # code can't be reused
    r = await client.post("/api/v1/auth/otp/verify", json={"phone": "+8801711000000", "code": code})
    assert r.status_code == 400


async def test_otp_attempt_limit(client):
    await client.post("/api/v1/auth/otp/start", json={"phone": "+8801711000001"})
    for _ in range(5):
        r = await client.post("/api/v1/auth/otp/verify", json={"phone": "+8801711000001", "code": "999999"})
        assert r.status_code in (400,)
    r = await client.post("/api/v1/auth/otp/verify", json={"phone": "+8801711000001", "code": "999999"})
    assert r.status_code == 429 and r.json()["code"] == "auth.otp_attempts"


async def test_otp_rate_limit_per_number(client):
    for _ in range(5):
        assert (await client.post("/api/v1/auth/otp/start", json={"phone": "+8801711000002"})).status_code == 200
    r = await client.post("/api/v1/auth/otp/start", json={"phone": "+8801711000002"})
    assert r.status_code == 429 and r.headers.get("retry-after")


def _id_token(**claims) -> str:
    enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")  # noqa: E731
    return f"{enc({'alg': 'RS256'})}.{enc(claims)}.sig"


@respx.mock
async def test_google_sign_in_and_link(client, monkeypatch):
    monkeypatch.setattr(settings, "google_oauth_client_id", "cid.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "google_oauth_client_secret", "secret")
    claims = {
        "aud": "cid.apps.googleusercontent.com",
        "iss": "https://accounts.google.com",
        "exp": time.time() + 600,
        "sub": "g-1",
        "email": "nadia@example.org",
        "email_verified": True,
        "name": "Nadia R",
    }
    respx.post("https://oauth2.googleapis.com/token").mock(
        return_value=httpx.Response(200, json={"id_token": _id_token(**claims)})
    )
    cfg = (await client.get("/api/v1/auth/google/config")).json()
    assert cfg == {"enabled": True, "client_id": "cid.apps.googleusercontent.com"}
    # missing X-Requested-With
    r = await client.post("/api/v1/auth/google", json={"code": "abc"})
    assert r.status_code == 400
    # existing password account with that email → needs the password
    await signup(client, email="nadia@example.org")
    client.cookies.clear()
    r = await client.post("/api/v1/auth/google", json={"code": "abc"}, headers={"X-Requested-With": "XmlHttpRequest"})
    assert r.status_code == 409 and r.json()["code"] == "auth.link_requires_password"
    link = r.json()["fields"]["link_token"]
    assert (
        await client.post("/api/v1/auth/google/link", json={"link_token": link, "password": "nope nope"})
    ).status_code == 401
    r = await client.post("/api/v1/auth/google/link", json={"link_token": link, "password": "correct horse"})
    assert r.status_code == 200
    client.cookies.clear()
    r = await client.post("/api/v1/auth/google", json={"code": "abc"}, headers={"X-Requested-With": "XmlHttpRequest"})
    assert r.status_code == 200 and r.json()["created"] is False


@respx.mock
async def test_google_rejects_bad_claims(client, monkeypatch):
    monkeypatch.setattr(settings, "google_oauth_client_id", "cid")
    monkeypatch.setattr(settings, "google_oauth_client_secret", "secret")
    bad = {
        "aud": "other",
        "iss": "https://accounts.google.com",
        "exp": time.time() + 600,
        "sub": "x",
        "email": "x@example.org",
        "email_verified": True,
    }
    respx.post("https://oauth2.googleapis.com/token").mock(
        return_value=httpx.Response(200, json={"id_token": _id_token(**bad)})
    )
    r = await client.post("/api/v1/auth/google", json={"code": "abc"}, headers={"X-Requested-With": "XmlHttpRequest"})
    assert r.status_code == 401 and r.json()["code"] == "auth.google_failed"


async def test_google_disabled(client):
    assert (await client.get("/api/v1/auth/google/config")).json() == {"enabled": False, "client_id": None}


async def test_token_roundtrip():
    import uuid

    from app.security import make_token

    uid = uuid.uuid4()
    tok, ttl = make_token(uid, "guest", 3)
    c = read_token(tok)
    assert c and c.user_id == uid and c.role == "guest" and c.sv == 3 and ttl == 7 * 24 * 3600
    assert read_token(tok + "x") is None


async def test_health_and_sources(client):
    r = await client.get("/api/v1/health")
    assert r.status_code == 200 and r.json()["db"] == "ok"
    assert r.json()["providers"].get("ecostress") == "off"
    r = await client.get("/api/v1/sources")
    body = r.json()
    ids = {s["id"] for s in body["sources"]}
    assert {"landsat", "power", "geos_fp", "geos_cf", "worldcover"} <= ids
    assert "0.55" in body["heat_score"]["text"]


async def test_demo_enter_and_exit_restores_previous(client):
    me = await signup(client, email="real@example.org", name="Real")
    r = await client.post("/api/v1/auth/demo", json={"lang": "bn"})
    assert r.status_code == 200
    demo = r.json()["user"]
    assert demo["is_demo"] is True and demo["display_name"] == "Nadia Rahman"
    prof = (await client.get("/api/v1/me/profile")).json()
    assert prof["home"] == {"lat": 23.759, "lng": 90.359} and prof["onboarded"] is True and prof["radius_m"] == 200
    r = await client.post("/api/v1/auth/demo/exit", json={})
    assert r.status_code == 200 and r.json()["user"]["id"] == me["id"]
    assert (await client.get("/api/v1/auth/me")).json()["id"] == me["id"]


async def test_demo_exit_without_previous_signs_out(client):
    await client.post("/api/v1/auth/demo", json={})
    r = await client.post("/api/v1/auth/demo/exit", json={})
    assert r.status_code == 200 and r.json() is None
    assert (await client.get("/api/v1/auth/me")).status_code == 401
