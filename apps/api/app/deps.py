"""Request dependencies: DB session, current user, role guards, device id."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .errors import forbidden, guest_restricted, unauthorized
from .models import User
from .security import DEVICE_COOKIE, SESSION_COOKIE, read_token, set_session_cookie, should_refresh

DB = Annotated[AsyncSession, Depends(get_db)]


@dataclass
class Viewer:
    """The caller. `user` is None for an anonymous visitor (no session at all)."""

    user: User | None
    device_id: str | None
    ip: str

    @property
    def is_guest(self) -> bool:
        return self.user is None or self.user.role == "guest"

    @property
    def id(self):
        return self.user.id if self.user else None

    @property
    def rate_key(self) -> str:
        if self.user:
            return f"u:{self.user.id}"
        return f"d:{self.device_id}" if self.device_id else f"ip:{self.ip}"


async def _load_user(request: Request, response: Response, db: AsyncSession) -> User | None:
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        return None
    claims = read_token(raw)
    if not claims:
        return None
    user = await db.get(User, claims.user_id)
    if not user or user.deleted_at is not None or user.blocked or user.session_version != claims.sv:
        return None
    now = datetime.now(UTC)
    if not user.last_seen_at or now - user.last_seen_at > timedelta(minutes=10):
        await db.execute(update(User).where(User.id == user.id).values(last_seen_at=now))
        await db.commit()
    if should_refresh(claims) or claims.role != user.role:
        set_session_cookie(response, request, user.id, user.role, user.session_version)
    return user


async def get_viewer(request: Request, response: Response, db: DB) -> Viewer:
    from .security import client_ip

    user = await _load_user(request, response, db)
    return Viewer(user=user, device_id=request.cookies.get(DEVICE_COOKIE), ip=client_ip(request))


ViewerDep = Annotated[Viewer, Depends(get_viewer)]


async def require_session(viewer: ViewerDep) -> User:
    """Any session, guest included."""
    if viewer.user is None:
        raise unauthorized()
    return viewer.user


async def require_user(viewer: ViewerDep) -> User:
    """A full account. Guests get 403 auth.guest_restricted (§6.2 A7)."""
    if viewer.user is None:
        raise unauthorized()
    if viewer.user.role == "guest":
        raise guest_restricted()
    return viewer.user


async def require_moderator(user: Annotated[User, Depends(require_user)]) -> User:
    if user.role not in ("moderator", "admin"):
        raise forbidden("auth.moderator_only", "Moderators only")
    return user


async def require_admin(user: Annotated[User, Depends(require_user)]) -> User:
    if user.role != "admin":
        raise forbidden("auth.admin_only", "Admins only")
    return user


SessionUser = Annotated[User, Depends(require_session)]
FullUser = Annotated[User, Depends(require_user)]
Moderator = Annotated[User, Depends(require_moderator)]
Admin = Annotated[User, Depends(require_admin)]
