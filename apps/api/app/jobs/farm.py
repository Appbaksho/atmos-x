"""Farm alert notifications for saved fields (prompt-v1 §7.9): once per field and alert."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import SessionLocal
from ..http import UpstreamError
from ..models import FarmField, Job, User
from ..services import farm as svc
from ..services import jobs as q
from ..services.notify import notify
from ..worker import handler

NOTIFY_LEVELS = ("danger", "warning")


@handler("farm_alerts")
async def farm_alerts(db: AsyncSession, job: Job) -> dict:
    rows = (
        (
            await db.execute(
                select(FarmField)
                .join(User, User.id == FarmField.user_id)
                .where(User.blocked.is_(False), User.deleted_at.is_(None), User.role != "guest")
            )
        )
        .scalars()
        .all()
    )
    sent = failed = 0
    for f in rows:
        try:
            res = await svc.alerts(db, f.lat, f.lng, f.crop, f.stage, field_id=f.id)
        except UpstreamError:
            failed += 1
            continue
        for a in res["alerts"]:
            if a["level"] not in NOTIFY_LEVELS:
                continue
            await notify(
                db,
                f.user_id,
                "farm_alert",
                a["title"],
                body={"code": "notif.farm.body", "params": {"field": f.name, "date": a["window"]["from"]}},
                screen="F03",
                params={"alert_id": a["id"], "field_id": str(f.id)},
                dedupe_key=f"farm:{f.id}:{a['id']}",
            )
            sent += 1
        await db.commit()
    return {"fields": len(rows), "notified": sent, "failed": failed}


async def enqueue_farm() -> None:
    now = datetime.now(UTC)
    async with SessionLocal() as db:
        await q.enqueue(db, "farm_alerts", now.strftime("%Y-%m-%dT%H"), {}, priority=5, max_attempts=2)
        await db.commit()
