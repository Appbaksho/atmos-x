"""Ask Atmos (prompt-v1 §6.12, §9 'Ask'): deterministic answers streamed as SSE.

Events (one per block, `event: <type>` + JSON `data`): `warning` → `token` (one I18nText sentence
each) → `sources` → `action` → `notice` → `done` {message_id, remaining_today, intent, suggestions};
`error` on failure. Limits: 30 a day for accounts, 5 for guests (A8).
"""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..deps import DB, ViewerDep
from ..errors import AppError, not_found
from ..models import AskMessage
from ..ratelimit import day_start_local, hit, peek
from ..schemas.common import lang_or_en
from ..services import ask as svc

router = APIRouter(tags=["ask"])

LIMIT = {"user": 30, "guest": 5}


class AskCtx(BaseModel):
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    zone_id: str | None = Field(default=None, max_length=24)
    tree_id: str | None = Field(default=None, max_length=40)
    field_id: str | None = Field(default=None, max_length=40)


class AskIn(BaseModel):
    message: str | None = Field(default=None, max_length=500)
    intent: str | None = Field(default=None, max_length=24)
    screen: str | None = Field(default=None, max_length=8)
    context: AskCtx | None = None
    lang: str = "en"
    crop: str | None = Field(default=None, max_length=12)
    stage: str | None = Field(default=None, max_length=12)
    farmer: bool = False


class FeedbackIn(BaseModel):
    helpful: bool


def _kind(viewer) -> str:
    return "guest" if viewer.is_guest else "user"


def _key(viewer) -> str:
    return f"ask:{viewer.rate_key}"


@router.get("/ask/usage", operation_id="ask_usage")
async def usage(db: DB, viewer: ViewerDep) -> dict:
    lim = LIMIT[_kind(viewer)]
    used = await peek(db, _key(viewer), day_start_local(datetime.now(UTC)))
    return {"limit": lim, "remaining_today": max(0, lim - used)}


def _sse(kind: str, data: dict) -> bytes:
    return f"event: {kind}\ndata: {json.dumps({'type': kind, **data}, ensure_ascii=False)}\n\n".encode()


@router.post("/ask", operation_id="ask", response_class=StreamingResponse)
async def ask(body: AskIn, db: DB, viewer: ViewerDep) -> StreamingResponse:
    t0 = time.perf_counter()
    kind = _kind(viewer)
    lim = LIMIT[kind]
    n = await hit(db, _key(viewer), day_start_local(datetime.now(UTC)))
    if n > lim:
        await db.rollback()
        if kind == "guest":
            raise AppError(403, "auth.guest_restricted", "Create a free account to ask more today")
        raise AppError(429, "ask.daily_limit", "You've used today's questions; ask again tomorrow")
    await db.commit()
    lang = lang_or_en(body.lang)
    if body.intent is not None and body.intent not in svc.ALL:
        raise AppError(400, "ask.intent", "Unknown intent")
    intent = body.intent or svc.classify(body.message or "", body.screen, body.farmer)
    user = viewer.user if not viewer.is_guest else None
    cx = body.context or AskCtx()
    lat, lng = await svc.resolve_place(db, user, cx.lat, cx.lng, cx.zone_id, cx.tree_id, cx.field_id)
    c = svc.Ctx(
        db=db,
        user=user,
        lang=lang,
        lat=lat,
        lng=lng,
        zone_id=cx.zone_id,
        tree_id=cx.tree_id,
        field_id=cx.field_id,
        crop=body.crop or "boro",
        stage=body.stage or "flowering",
    )
    try:
        a = await svc.answer(c, intent)
        error = None
    except Exception as e:  # noqa: BLE001  any failure becomes an `error` event, never a broken stream
        svc.log.exception("ask failed", extra={"data": {"intent": intent}})
        a, error = (
            svc.Answer(intent=intent, answered=False),
            {"code": "ask.failed", "message": str(e)[:120] or "Ask failed"},
        )
    msg = AskMessage(
        id=uuid.uuid4(),
        user_id=viewer.user.id if viewer.user else None,
        intent=intent,
        screen=body.screen,
        lang=lang,
        answered=a.answered and error is None,
        unanswered_text=(body.message or "")[:500] if (not a.answered or error) and body.message else None,
        ms=int((time.perf_counter() - t0) * 1000),
    )
    db.add(msg)
    await db.commit()
    remaining = max(0, lim - n)

    async def stream() -> AsyncIterator[bytes]:
        for w in a.warnings:
            yield _sse("warning", w)
        for p in a.parts:
            yield _sse("token", {"text": p})
        if a.sources:
            yield _sse("sources", {"sources": a.sources})
        for act in a.actions:
            yield _sse("action", {"action": act})
        for nt in a.notices:
            yield _sse("notice", {"text": nt})
        if error:
            yield _sse("error", error)
        yield _sse(
            "done",
            {
                "message_id": str(msg.id),
                "remaining_today": remaining,
                "intent": intent,
                "suggestions": svc.CHIPS.get(intent, []),
            },
        )

    return StreamingResponse(
        stream(), media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"}
    )


@router.post("/ask/{message_id}/feedback", operation_id="ask_feedback", status_code=204)
async def feedback(message_id: uuid.UUID, body: FeedbackIn, db: DB, viewer: ViewerDep) -> None:
    m = await db.get(AskMessage, message_id)
    if m is None or (m.user_id is not None and (viewer.user is None or viewer.user.id != m.user_id)):
        raise not_found("ask.not_found", "Message not found")
    m.helpful = body.helpful
    await db.commit()
