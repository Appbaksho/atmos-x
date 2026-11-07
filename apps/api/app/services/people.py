"""Small shared helpers for community features: public person cards, blocks, demo separation."""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..media import photo_url
from ..models import Block, Photo, User


async def cards(
    db: AsyncSession, ids: set[uuid.UUID] | list[uuid.UUID], viewer: User | None = None
) -> dict[uuid.UUID, dict]:
    """{id: {id, display_name, avatar_url}}. Avatars show only once approved (owners always see theirs)."""
    ids = {i for i in ids if i}
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(User.id, User.display_name, User.avatar_photo_id, User.deleted_at).where(User.id.in_(ids))
        )
    ).all()
    photo_ids = {r.avatar_photo_id for r in rows if r.avatar_photo_id}
    ok = set()
    if photo_ids:
        ok = set(
            (await db.execute(select(Photo.id).where(Photo.id.in_(photo_ids), Photo.moderation == "approved")))
            .scalars()
            .all()
        )
    out = {}
    for r in rows:
        show = r.avatar_photo_id and (r.avatar_photo_id in ok or (viewer is not None and viewer.id == r.id))
        out[r.id] = {
            "id": str(r.id),
            "display_name": r.display_name if not r.deleted_at else "",
            "avatar_url": photo_url(r.avatar_photo_id, "thumb") if show else None,
        }
    return out


async def blocked_ids(db: AsyncSession, user_id: uuid.UUID | None) -> set[uuid.UUID]:
    """People this user blocked or who blocked them: hidden from each other both ways."""
    if user_id is None:
        return set()
    rows = (
        await db.execute(
            select(Block.blocker_id, Block.blocked_id).where(
                or_(Block.blocker_id == user_id, Block.blocked_id == user_id)
            )
        )
    ).all()
    return {b if a == user_id else a for a, b in rows}


def demo_filter(col, viewer: User | None):
    """Demo users see the invented demo community; everyone else never sees demo rows."""
    return col.is_(True) if viewer is not None and viewer.is_demo else col.is_(False)
