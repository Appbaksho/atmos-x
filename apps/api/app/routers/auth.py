"""Auth routes (prompt-v1 §9 'Auth and me')."""

from __future__ import annotations

from fastapi import APIRouter, Header, Request, Response

from ..config import settings
from ..deps import DB, SessionUser, ViewerDep
from ..errors import AppError, unauthorized
from ..media import photo_url
from ..models import User
from ..ratelimit import limit
from ..schemas.auth import (
    GoogleConfigOut,
    GoogleIn,
    GoogleLinkIn,
    GuestIn,
    LoginIn,
    OtpStartIn,
    OtpStartOut,
    OtpVerifyIn,
    RegisterIn,
    SessionOut,
    UserOut,
)
from ..schemas.common import Ok
from ..security import clear_session_cookie, set_session_cookie
from ..services import auth as svc

router = APIRouter(prefix="/auth", tags=["auth"])


def user_out(u: User) -> UserOut:
    return UserOut(
        id=str(u.id),
        role=u.role,  # type: ignore[arg-type]
        email=u.email,
        phone_verified=bool(u.phone),
        display_name=u.display_name,
        avatar_url=photo_url(u.avatar_photo_id, "thumb"),
        is_demo=u.is_demo,
        created_at=u.created_at,
    )


async def _ip_limit(db, viewer, name: str, n: int = 20) -> None:
    await limit(db, f"auth:{name}:{viewer.ip}", n, 3600, code="auth.rate_limited")
    await db.commit()  # the hit counts even when the attempt fails


async def _finish(db, request: Request, response: Response, user: User, created: bool = False) -> SessionOut:
    await db.commit()
    await db.refresh(user)
    set_session_cookie(response, request, user.id, user.role, user.session_version)
    return SessionOut(user=user_out(user), created=created)


@router.post("/register", response_model=SessionOut, operation_id="auth_register")
async def register(body: RegisterIn, request: Request, response: Response, db: DB, viewer: ViewerDep):
    await _ip_limit(db, viewer, "register", 10)
    user = await svc.register(
        db, viewer.user, email=body.email, password=body.password, display_name=body.display_name, lang=body.lang
    )
    return await _finish(db, request, response, user, created=True)


@router.post("/login", response_model=SessionOut, operation_id="auth_login")
async def login(body: LoginIn, request: Request, response: Response, db: DB, viewer: ViewerDep):
    await _ip_limit(db, viewer, "login", 20)
    user = await svc.login(db, email=body.email, password=body.password)
    return await _finish(db, request, response, user)


@router.post("/logout", response_model=Ok, operation_id="auth_logout")
async def logout(request: Request, response: Response):
    clear_session_cookie(response, request)
    return Ok()


@router.post("/guest", response_model=SessionOut, operation_id="auth_guest")
async def guest(body: GuestIn, request: Request, response: Response, db: DB, viewer: ViewerDep):
    if viewer.user is not None:
        return SessionOut(user=user_out(viewer.user))
    await _ip_limit(db, viewer, "guest", 60)
    user = await svc.create_guest(db, body.lang)
    return await _finish(db, request, response, user, created=True)


@router.post("/upgrade", response_model=SessionOut, operation_id="auth_upgrade")
async def upgrade(body: RegisterIn, request: Request, response: Response, db: DB, user: SessionUser):
    upgraded = await svc.upgrade(db, user, email=body.email, password=body.password, display_name=body.display_name)
    return await _finish(db, request, response, upgraded, created=True)


@router.post("/otp/start", response_model=OtpStartOut, operation_id="auth_otp_start")
async def otp_start(body: OtpStartIn, db: DB, viewer: ViewerDep):
    out = await svc.otp_start(db, body.phone, viewer.ip)
    await db.commit()
    return OtpStartOut(**out, dev_console=settings.sms_provider == "console" and not settings.is_production)


@router.post("/otp/verify", response_model=SessionOut, operation_id="auth_otp_verify")
async def otp_verify(body: OtpVerifyIn, request: Request, response: Response, db: DB, viewer: ViewerDep):
    await _ip_limit(db, viewer, "otp_verify", 30)
    user, created = await svc.otp_verify(db, viewer.user, body.phone, body.code, body.lang)
    return await _finish(db, request, response, user, created)


@router.get("/google/config", response_model=GoogleConfigOut, operation_id="auth_google_config")
async def google_config():
    return GoogleConfigOut(
        enabled=settings.google_enabled, client_id=settings.google_oauth_client_id if settings.google_enabled else None
    )


@router.post("/google", response_model=SessionOut, operation_id="auth_google")
async def google(
    body: GoogleIn,
    request: Request,
    response: Response,
    db: DB,
    viewer: ViewerDep,
    x_requested_with: str | None = Header(default=None),
    origin: str | None = Header(default=None),
):
    # The popup code flow is only valid from our own page (GIS sends this header).
    if (x_requested_with or "").lower() != "xmlhttprequest":
        raise AppError(400, "auth.google_bad_request", "Missing X-Requested-With")
    await _ip_limit(db, viewer, "google", 30)
    claims = await svc.exchange_google_code(body.code, origin or settings.public_web_origin)
    user, created = await svc.sign_in_google(db, viewer.user, claims, body.lang)
    return await _finish(db, request, response, user, created)


@router.post("/google/link", response_model=SessionOut, operation_id="auth_google_link")
async def google_link(body: GoogleLinkIn, request: Request, response: Response, db: DB, viewer: ViewerDep):
    await _ip_limit(db, viewer, "google_link", 10)
    user = await svc.link_google(db, body.link_token, body.password)
    return await _finish(db, request, response, user)


@router.get("/me", response_model=UserOut, operation_id="auth_me")
async def me(viewer: ViewerDep):
    if viewer.user is None:
        raise unauthorized("No session")
    return user_out(viewer.user)
