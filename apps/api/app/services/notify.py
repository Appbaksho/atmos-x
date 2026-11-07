"""In-app notifications (prompt-v1 §6.8 C12), deduplicated per user by key. Web push is sent by the worker."""

from __future__ import annotations

import uuid

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Notification


async def notify(
    db: AsyncSession,
    user_id: uuid.UUID,
    kind: str,
    title: dict,
    *,
    body: dict | None = None,
    screen: str | None = None,
    params: dict | None = None,
    dedupe_key: str | None = None,
) -> None:
    stmt = insert(Notification).values(
        id=uuid.uuid4(),
        user_id=user_id,
        kind=kind,
        title=title,
        body=body,
        screen=screen,
        params=params or {},
        read=False,
        dedupe_key=dedupe_key,
    )
    if dedupe_key:
        stmt = stmt.on_conflict_do_nothing(index_elements=["user_id", "dedupe_key"])
    await db.execute(stmt)
