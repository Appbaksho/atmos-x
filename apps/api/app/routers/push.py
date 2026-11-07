"""Web push (prompt-v1 §6.13 W2): config for the client, subscribe and unsubscribe."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..deps import DB, FullUser
from ..services import push as svc

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/config", operation_id="push_config")
async def push_config() -> dict:
    """Whether push is on for this server, its VAPID public key and the quiet hours."""
    return svc.config()


class Keys(BaseModel):
    p256dh: str = Field(min_length=10, max_length=200)
    auth: str = Field(min_length=8, max_length=100)


class SubscribeIn(BaseModel):
    endpoint: str = Field(min_length=12, max_length=1000)
    keys: Keys
    #: Minutes east of UTC (Dhaka = 360), for quiet hours.
    tz_offset_min: int = Field(default=360, ge=-720, le=840)


@router.post("/subscribe", operation_id="push_subscribe")
async def push_subscribe(body: SubscribeIn, db: DB, user: FullUser) -> dict:
    return await svc.subscribe(db, user, body.endpoint, body.keys.p256dh, body.keys.auth, body.tz_offset_min)


class UnsubscribeIn(BaseModel):
    endpoint: str | None = Field(default=None, max_length=1000)


@router.post("/unsubscribe", operation_id="push_unsubscribe")
async def push_unsubscribe(body: UnsubscribeIn, db: DB, user: FullUser) -> dict:
    return await svc.unsubscribe(db, user, body.endpoint)
