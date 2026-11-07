"""/me routes (prompt-v1 §9 'Auth and me')."""

from __future__ import annotations

from fastapi import APIRouter

from ..deps import DB, SessionUser
from ..schemas.auth import ProfileOut, ProfilePatch
from ..services import profile as svc

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/profile", response_model=ProfileOut, operation_id="me_profile")
async def get_profile(db: DB, user: SessionUser):
    prof = await svc.get_profile(db, user)
    await db.commit()
    return svc.profile_out(user, prof)


@router.patch("/profile", response_model=ProfileOut, operation_id="me_profile_patch")
async def patch_profile(body: ProfilePatch, db: DB, user: SessionUser):
    prof = await svc.patch_profile(db, user, body)
    await db.commit()
    return svc.profile_out(user, prof)
