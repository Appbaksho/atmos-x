"""Passwords (argon2id), session JWTs and cookie handling (prompt-v1 §6.2 A2, A5)."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
import uuid
from dataclasses import dataclass

import jwt
from fastapi import Request, Response
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from .config import settings

SESSION_COOKIE = "atmos_session"
DEVICE_COOKIE = "atmos_device"
USER_TTL_S = 30 * 24 * 3600
GUEST_TTL_S = 7 * 24 * 3600
ALG = "HS256"

_hasher = PasswordHash((Argon2Hasher(),))
# Hash of a random password, verified against when the account does not exist, so timing does not
# reveal which emails are registered.
_DUMMY = _hasher.hash(secrets.token_hex(16))


def hash_password(pw: str) -> str:
    return _hasher.hash(pw)


def verify_password(pw: str, hashed: str | None) -> bool:
    if not hashed:
        _hasher.verify(pw, _DUMMY)
        return False
    try:
        return _hasher.verify(pw, hashed)
    except Exception:
        return False


def hash_token(raw: str) -> str:
    """For OTP codes and sensor tokens: keyed SHA-256 (fast, fine for high-entropy or rate-limited secrets)."""
    return hmac.new(settings.jwt_secret.encode(), raw.encode(), hashlib.sha256).hexdigest()


@dataclass
class SessionClaims:
    user_id: uuid.UUID
    role: str
    sv: int
    iat: int
    exp: int

    @property
    def ttl(self) -> int:
        return self.exp - self.iat


def make_token(user_id: uuid.UUID, role: str, sv: int, now: int | None = None) -> tuple[str, int]:
    now = now or int(time.time())
    ttl = GUEST_TTL_S if role == "guest" else USER_TTL_S
    payload = {"sub": str(user_id), "role": role, "sv": sv, "iat": now, "exp": now + ttl}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALG), ttl


def read_token(token: str) -> SessionClaims | None:
    try:
        p = jwt.decode(token, settings.jwt_secret, algorithms=[ALG], options={"require": ["sub", "exp", "iat"]})
        return SessionClaims(
            uuid.UUID(p["sub"]), p.get("role", "user"), int(p.get("sv", 0)), int(p["iat"]), int(p["exp"])
        )
    except (jwt.PyJWTError, ValueError, KeyError):
        return None


def _secure(request: Request | None) -> bool:
    if settings.cookie_secure:
        return True
    if request is None:
        return False
    host = (request.headers.get("x-forwarded-host") or request.url.hostname or "").split(":")[0]
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    return proto == "https" and host not in ("localhost", "127.0.0.1")


def set_session_cookie(response: Response, request: Request | None, user_id: uuid.UUID, role: str, sv: int) -> None:
    token, ttl = make_token(user_id, role, sv)
    response.set_cookie(
        SESSION_COOKIE, token, max_age=ttl, httponly=True, samesite="lax", secure=_secure(request), path="/"
    )


def clear_session_cookie(response: Response, request: Request | None) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax", secure=_secure(request))


def should_refresh(c: SessionClaims, now: int | None = None) -> bool:
    """Sliding refresh when under 50 % of the lifetime remains."""
    now = now or int(time.time())
    return (c.exp - now) < c.ttl / 2


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
