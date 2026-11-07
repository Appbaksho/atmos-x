"""Web push delivery every 5 minutes (prompt-v1 §6.13 W2)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import SessionLocal
from ..models import Job
from ..services import jobs as q
from ..services import push as P
from ..worker import handler


@handler("push_send")
async def push_send(db: AsyncSession, job: Job) -> dict:
    return await P.send_pending(db)


async def enqueue_push() -> None:
    if not settings.push_enabled:
        return
    now = datetime.now(UTC)
    async with SessionLocal() as db:
        await q.enqueue(
            db, "push_send", now.strftime("%Y-%m-%dT%H:") + f"{now.minute // 5:02d}", {}, priority=4, max_attempts=1
        )
        await db.commit()
