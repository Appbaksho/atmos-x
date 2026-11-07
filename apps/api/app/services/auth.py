"""Accounts and sign-in (prompt-v1 §6.2 A1–A6, A10).

Guests are real rows (role 'guest'). Signing up from a guest session upgrades that row in place, so
every goal, draft and setting the guest made is kept (A6). Signing in to an existing account from a
guest session switches accounts and leaves the guest behind.
"""

from __future__ import annotations

import base64
import json
import logging
import re
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..errors import AppError, bad_request, conflict
from ..http import UpstreamError, fetch
from ..models import AuthIdentity, OtpChallenge, Profile, User
from ..security import hash_password, hash_token, verify_password

log = logging.getLogger("atmos.auth")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")
MIN_PASSWORD = 8
OTP_TTL = timedelta(minutes=10)
OTP_MAX_ATTEMPTS = 5

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
SKEW_S = 120


def normalize_email(email: str) -> str:
    e = (email or "").strip().lower()
    if not EMAIL_RE.match(e) or len(e) > 320:
        raise bad_request("auth.email_invalid", "Enter a valid email", {"email": "invalid"})
    return e


def normalize_phone(phone: str) -> str:
    p = re.sub(r"[\s\-()]", "", phone or "")
    if p.startswith("00"):
        p = "+" + p[2:]
    if not p.startswith("+") and p.startswith("01") and len(p) == 11:
        p = "+880" + p[1:]  # Bangladesh local mobile format
    if not E164_RE.match(p):
        raise bad_request(
            "auth.phone_invalid", "Enter the number with its country code, e.g. +8801…", {"phone": "invalid"}
        )
    return p


def check_password(pw: str) -> None:
    if len(pw or "") < MIN_PASSWORD:
        raise bad_request("auth.password_short", f"Use at least {MIN_PASSWORD} characters", {"password": "too_short"})


def _clean_name(name: str | None, fallback: str) -> str:
    n = re.sub(r"\s+", " ", (name or "").strip())[:80]
    return n or fallback


async def _ensure_profile(db: AsyncSession, user: User, lang: str | None = None) -> Profile:
    prof = await db.get(Profile, user.id)
    if prof is None:
        prof = Profile(user_id=user.id, lang=lang or "en")
        db.add(prof)
    elif lang and not prof.onboarded:
        prof.lang = lang
    return prof


async def _identity(db: AsyncSession, provider: str, subject: str) -> AuthIdentity | None:
    return (
        await db.execute(
            select(AuthIdentity).where(AuthIdentity.provider == provider, AuthIdentity.provider_subject == subject)
        )
    ).scalar_one_or_none()


async def create_guest(db: AsyncSession, lang: str | None) -> User:
    user = User(role="guest", display_name="")
    db.add(user)
    await db.flush()
    await _ensure_profile(db, user, lang)
    return user


async def _new_or_upgrade(
    db: AsyncSession, current: User | None, *, display_name: str, lang: str | None
) -> tuple[User, bool]:
    """Upgrade the current guest in place, or create a new user. Returns (user, upgraded)."""
    if current is not None and current.role == "guest":
        current.role = "user"
        current.display_name = display_name
        current.session_version += 1  # rotate
        await _ensure_profile(db, current, lang)
        return current, True
    user = User(role="user", display_name=display_name)
    db.add(user)
    await db.flush()
    await _ensure_profile(db, user, lang)
    return user, False


async def register(
    db: AsyncSession, current: User | None, *, email: str, password: str, display_name: str, lang: str | None
) -> User:
    email = normalize_email(email)
    check_password(password)
    if (await db.execute(select(User.id).where(User.email == email))).first():
        raise conflict("auth.email_taken", "That email already has an account")
    user, _ = await _new_or_upgrade(db, current, display_name=_clean_name(display_name, email.split("@")[0]), lang=lang)
    user.email = email
    user.password_hash = hash_password(password)
    db.add(AuthIdentity(user_id=user.id, provider="password", provider_subject=email))
    await db.flush()
    return user


async def login(db: AsyncSession, *, email: str, password: str) -> User:
    e = (email or "").strip().lower()
    user = (await db.execute(select(User).where(User.email == e, User.deleted_at.is_(None)))).scalar_one_or_none()
    if not verify_password(password or "", user.password_hash if user else None) or user is None or user.blocked:
        raise AppError(401, "auth.invalid_credentials", "Email or password is wrong")
    user.session_version += 1
    return user


# ── Phone OTP (A3) ─────────────────────────────────────────────────────────


class SmsProvider:
    name = "base"

    async def send(self, phone: str, code: str) -> None:  # pragma: no cover - interface
        raise NotImplementedError

    async def check(self, phone: str, code: str) -> bool | None:
        """Providers that verify codes themselves (Twilio Verify) return True/False; others None."""
        return None


class ConsoleSms(SmsProvider):
    """Development only: logs the code. Refuses to run in production."""

    name = "console"

    async def send(self, phone: str, code: str) -> None:
        if settings.is_production:
            raise AppError(503, "auth.sms_unavailable", "SMS is not configured")
        log.warning("otp code (console provider, development only)", extra={"data": {"phone": phone, "code": code}})


class TwilioVerifySms(SmsProvider):
    name = "twilio"

    def _url(self, path: str) -> str:
        return f"https://verify.twilio.com/v2/Services/{settings.twilio_verify_service_sid}/{path}"

    async def send(self, phone: str, code: str) -> None:
        if not settings.twilio_enabled:
            raise AppError(503, "auth.sms_unavailable", "SMS is not configured")
        try:
            await fetch(
                "twilio",
                "POST",
                self._url("Verifications"),
                data={"To": phone, "Channel": "sms"},
                auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                timeout=8,
                ok_statuses=(200, 201),
            )
        except UpstreamError as e:
            raise AppError(503, "auth.sms_failed", "Could not send the code, try again") from e

    async def check(self, phone: str, code: str) -> bool | None:
        try:
            r = await fetch(
                "twilio",
                "POST",
                self._url("VerificationCheck"),
                data={"To": phone, "Code": code},
                auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                timeout=8,
                ok_statuses=(200, 201, 404),
            )
        except UpstreamError as e:
            raise AppError(503, "auth.sms_failed", "Could not check the code, try again") from e
        return r.status_code in (200, 201) and r.json().get("status") == "approved"


def sms_provider() -> SmsProvider:
    return TwilioVerifySms() if settings.sms_provider == "twilio" else ConsoleSms()


async def otp_start(db: AsyncSession, phone: str, ip: str) -> dict:
    from ..ratelimit import limit

    phone = normalize_phone(phone)
    await limit(db, f"otp:phone:{phone}", 5, 3600, code="auth.otp_rate_limited")
    await limit(db, f"otp:ip:{ip}", 10, 3600, code="auth.otp_rate_limited")
    provider = sms_provider()
    code = f"{secrets.randbelow(10**6):06d}"
    await db.execute(
        update(OtpChallenge)
        .where(OtpChallenge.phone == phone, OtpChallenge.consumed_at.is_(None))
        .values(consumed_at=func.now())
    )
    db.add(
        OtpChallenge(
            phone=phone,
            code_hash=hash_token(code),
            expires_at=datetime.now(UTC) + OTP_TTL,
            provider=provider.name,
            ip=ip,
        )
    )
    await db.flush()
    await provider.send(phone, code)
    return {"phone": phone, "expires_in": int(OTP_TTL.total_seconds())}


async def otp_verify(
    db: AsyncSession, current: User | None, phone: str, code: str, lang: str | None
) -> tuple[User, bool]:
    phone = normalize_phone(phone)
    ch = (
        await db.execute(
            select(OtpChallenge)
            .where(OtpChallenge.phone == phone, OtpChallenge.consumed_at.is_(None))
            .order_by(OtpChallenge.created_at.desc())
            .limit(1)
            .with_for_update()
        )
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    if ch is None or ch.expires_at < now:
        raise AppError(400, "auth.otp_expired", "The code expired; ask for a new one")
    if ch.attempts >= OTP_MAX_ATTEMPTS:
        raise AppError(429, "auth.otp_attempts", "Too many tries; ask for a new code")
    ch.attempts += 1
    code = re.sub(r"\D", "", code or "")
    provider_ok = await sms_provider().check(phone, code) if ch.provider == "twilio" else None
    ok = provider_ok if provider_ok is not None else secrets.compare_digest(ch.code_hash, hash_token(code))
    if not ok:
        await db.commit()  # keep the attempt count
        raise AppError(400, "auth.otp_wrong", "That code is not right")
    ch.consumed_at = now
    ident = await _identity(db, "phone", phone)
    if ident:
        user = await db.get(User, ident.user_id)
        assert user is not None
        user.session_version += 1
        return user, False
    user, _ = await _new_or_upgrade(db, current, display_name=_clean_name(None, "Atmos " + phone[-4:]), lang=lang)
    user.phone = phone
    db.add(AuthIdentity(user_id=user.id, provider="phone", provider_subject=phone))
    await db.flush()
    return user, True


# ── Google (A4) ─────────────────────────────────────────────────────────────


def _fail(why: str) -> AppError:
    return AppError(401, "auth.google_failed", f"Google sign-in failed: {why}")


def claims_from_id_token(id_token: str, client_id: str, now_s: float | None = None) -> dict:
    """Claim checks. The token comes straight from Google's token endpoint over TLS (OIDC Core §3.1.3.7)."""
    now_s = now_s or time.time()
    parts = id_token.split(".")
    if len(parts) < 2:
        raise _fail("malformed id_token")
    try:
        pad = "=" * (-len(parts[1]) % 4)
        p = json.loads(base64.urlsafe_b64decode(parts[1] + pad))
    except Exception:
        raise _fail("malformed id_token")
    aud = p.get("aud")
    if client_id not in (aud if isinstance(aud, list) else [aud]):
        raise _fail("wrong audience")
    if p.get("iss") not in GOOGLE_ISSUERS:
        raise _fail("wrong issuer")
    if not isinstance(p.get("exp"), (int, float)) or p["exp"] < now_s - SKEW_S:
        raise _fail("expired")
    if not p.get("sub"):
        raise _fail("no subject")
    if not p.get("email"):
        raise _fail("no email")
    if p.get("email_verified") not in (True, "true"):
        raise AppError(403, "auth.google_unverified", "The Google account email is not verified")
    return {
        "sub": str(p["sub"]),
        "email": str(p["email"]).strip().lower(),
        "name": p.get("name"),
        "picture": p.get("picture"),
    }


async def _google_token(code: str, redirect_uri: str) -> tuple[int, dict]:
    try:
        r = await fetch(
            "google_oauth",
            "POST",
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
            timeout=8,
            ok_statuses=(200, 400, 401),
        )
    except UpstreamError as e:
        raise AppError(502, "auth.google_unreachable", "Google did not answer, try again") from e
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {}


async def exchange_google_code(code: str, page_origin: str | None) -> dict:
    """Popup codes use redirect_uri 'postmessage'; on redirect_uri_mismatch retry with the page origin."""
    if not settings.google_enabled:
        raise AppError(503, "auth.google_not_configured", "Google sign-in is not set up on this server")
    status, body = await _google_token(code, "postmessage")
    if body.get("error") == "redirect_uri_mismatch" and page_origin:
        status, body = await _google_token(code, page_origin)
    if status != 200 or not body.get("id_token"):
        if body.get("error") in ("invalid_client", "unauthorized_client"):
            log.error("google sign-in misconfigured", extra={"data": {"error": body.get("error")}})
        raise _fail(body.get("error") or f"HTTP {status}")
    return claims_from_id_token(body["id_token"], settings.google_oauth_client_id)


LINK_TTL_S = 600


def make_link_token(claims: dict) -> str:
    now = int(time.time())
    return jwt.encode(
        {"typ": "glink", **claims, "iat": now, "exp": now + LINK_TTL_S}, settings.jwt_secret, algorithm="HS256"
    )


def read_link_token(token: str) -> dict:
    try:
        p = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise AppError(400, "auth.link_expired", "Start Google sign-in again")
    if p.get("typ") != "glink":
        raise AppError(400, "auth.link_expired", "Start Google sign-in again")
    return p


async def sign_in_google(db: AsyncSession, current: User | None, claims: dict, lang: str | None) -> tuple[User, bool]:
    ident = await _identity(db, "google", claims["sub"])
    if ident:
        user = await db.get(User, ident.user_id)
        assert user is not None
        if user.blocked or user.deleted_at:
            raise AppError(403, "auth.blocked", "This account is not available")
        user.session_version += 1
        return user, False
    existing = (await db.execute(select(User).where(User.email == claims["email"]))).scalar_one_or_none()
    if existing is not None:
        # Known V0 gap closed: linking Google to an email account needs that account's password.
        raise AppError(
            409,
            "auth.link_requires_password",
            "This email already has an account. Enter its password to link Google.",
            fields={"link_token": make_link_token(claims)},
        )
    user, _ = await _new_or_upgrade(
        db, current, display_name=_clean_name(claims.get("name"), claims["email"].split("@")[0]), lang=lang
    )
    user.email = claims["email"]
    db.add(AuthIdentity(user_id=user.id, provider="google", provider_subject=claims["sub"]))
    await db.flush()
    return user, True


async def link_google(db: AsyncSession, link_token: str, password: str) -> User:
    claims = read_link_token(link_token)
    user = (await db.execute(select(User).where(User.email == claims["email"]))).scalar_one_or_none()
    if user is None or not verify_password(password or "", user.password_hash):
        raise AppError(401, "auth.invalid_credentials", "That password is not right")
    if not await _identity(db, "google", claims["sub"]):
        db.add(AuthIdentity(user_id=user.id, provider="google", provider_subject=claims["sub"]))
    user.session_version += 1
    await db.flush()
    return user


async def upgrade(db: AsyncSession, current: User, *, email: str, password: str, display_name: str) -> User:
    if current.role != "guest":
        raise AppError(400, "auth.not_guest", "Already signed in")
    return await register(db, current, email=email, password=password, display_name=display_name, lang=None)


async def make_admin(db: AsyncSession, email: str) -> User:
    user = (await db.execute(select(User).where(User.email == email.strip().lower()))).scalar_one_or_none()
    if user is None:
        raise ValueError(f"no user with email {email}")
    user.role = "admin"
    user.session_version += 1
    return user


def new_id() -> uuid.UUID:
    return uuid.uuid4()
