"""/health and /sources (prompt-v1 §9 'Meta')."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from ..config import PIPELINE_VERSION, settings
from ..deps import DB
from ..http import BREAKERS
from ..services import sources as sources_svc

router = APIRouter(tags=["meta"])


class HealthOut(BaseModel):
    db: str
    data_mode: str
    providers: dict[str, str]
    worker_last_run: str | None
    pipeline_version: str


@router.get("/health", response_model=HealthOut, operation_id="health")
async def health(db: DB):
    try:
        await db.execute(text("select 1"))
        db_state = "ok"
    except Exception:
        db_state = "down"
    hb = None
    if db_state == "ok":
        row = (await db.execute(text("select fetched_at from data_cache where key = 'worker:heartbeat'"))).first()
        hb = row[0].isoformat() if row else None
    providers = {name: b.state for name, b in BREAKERS.items()}
    for s in sources_svc.credential_off():
        providers[s] = "off"
    return HealthOut(
        db=db_state,
        data_mode=settings.data_mode,
        providers=providers,
        worker_last_run=hb,
        pipeline_version=PIPELINE_VERSION,
    )


@router.get("/sources", response_model=sources_svc.SourcesOut, operation_id="sources")
async def sources(db: DB):
    return await sources_svc.sources_report(db)
