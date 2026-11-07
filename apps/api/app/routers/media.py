"""/media: photos. Public copies only when approved; owners always see their own (§7.12)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter
from fastapi.responses import FileResponse

from ..deps import DB, ViewerDep
from ..errors import not_found
from ..models import Photo
from ..storage import storage

router = APIRouter(prefix="/media", tags=["media"], include_in_schema=False)

SIZES = {"public": "path_public", "thumb": "path_thumb"}


@router.get("/photos/{photo_id}/{size}.jpg")
async def photo(photo_id: uuid.UUID, size: str, db: DB, viewer: ViewerDep):
    attr = SIZES.get(size)
    p = await db.get(Photo, photo_id)
    if attr is None or p is None:
        raise not_found("media.not_found", "Photo not found")
    is_owner = viewer.user is not None and viewer.user.id == p.owner_id
    is_mod = viewer.user is not None and viewer.user.role in ("moderator", "admin")
    if not (is_owner or is_mod or (p.moderation == "approved" and not p.private)):
        raise not_found("media.not_found", "Photo not found")
    rel = getattr(p, attr)
    if not rel or not storage().exists(rel):
        raise not_found("media.not_found", "Photo not found")
    cache = "public, max-age=86400" if p.moderation == "approved" and not p.private else "private, no-store"
    return FileResponse(storage().path(rel), media_type="image/jpeg", headers={"Cache-Control": cache})
