"""/media: photos. Public copies only when approved; owners always see their own (§7.12)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter
from fastapi.responses import FileResponse
from sqlalchemy import or_, select

from ..deps import DB, ViewerDep
from ..errors import not_found
from ..models import Action, Photo, Tree, TreeCheck
from ..storage import storage

router = APIRouter(prefix="/media", tags=["media"], include_in_schema=False)

SIZES = {"public": "path_public", "thumb": "path_thumb"}


async def _shared_evidence(db, p: Photo, user) -> bool:
    """Private evidence photos are visible to the people who may review the action or help with the tree."""
    from ..services import actions as A
    from ..services import trees as T

    if p.moderation == "rejected":
        return False
    a = (await db.execute(select(Action).where(Action.photo_id == p.id).limit(1))).scalar_one_or_none()
    if a is not None and (
        await A.can_review(db, a, user) or (a.team_id is not None and a.team_id in await A._team_ids(db, user.id))
    ):
        return True
    t = (
        await db.execute(
            select(Tree)
            .outerjoin(TreeCheck, TreeCheck.tree_id == Tree.id)
            .where(or_(Tree.photo_id == p.id, TreeCheck.photo_id == p.id))
            .limit(1)
        )
    ).scalar_one_or_none()
    return t is not None and await T.can_see(db, t, user)


@router.get("/photos/{photo_id}/{size}.jpg")
async def photo(photo_id: uuid.UUID, size: str, db: DB, viewer: ViewerDep):
    attr = SIZES.get(size)
    p = await db.get(Photo, photo_id)
    if attr is None or p is None:
        raise not_found("media.not_found", "Photo not found")
    is_owner = viewer.user is not None and viewer.user.id == p.owner_id
    is_mod = viewer.user is not None and viewer.user.role in ("moderator", "admin")
    if not (
        is_owner
        or is_mod
        or (p.moderation == "approved" and not p.private)
        or (viewer.user is not None and await _shared_evidence(db, p, viewer.user))
    ):
        raise not_found("media.not_found", "Photo not found")
    rel = getattr(p, attr)
    if not rel or not storage().exists(rel):
        raise not_found("media.not_found", "Photo not found")
    cache = "public, max-age=86400" if p.moderation == "approved" and not p.private else "private, no-store"
    return FileResponse(storage().path(rel), media_type="image/jpeg", headers={"Cache-Control": cache})
