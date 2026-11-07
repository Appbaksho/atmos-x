"""Web push (prompt-v1 §6.13 W2): disabled without keys, subscribe/unsubscribe, quiet hours,
private per-kind text, and pruning of gone subscriptions."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.config import settings
from app.models import Notification, Profile, PushSubscription
from app.services import push as P
from tests.conftest import signup

SUB = {
    "endpoint": "https://push.example.org/send/abc123",
    "keys": {"p256dh": "BPUBLICKEY-0123456789", "auth": "AUTHSECRET-01"},
    "tz_offset_min": 360,
}


@pytest.fixture
def keys(monkeypatch):
    monkeypatch.setattr(settings, "vapid_public_key", "BTestPublicKey")
    monkeypatch.setattr(settings, "vapid_private_key", "test-private-key")


async def test_push_is_off_without_keys(client):
    cfg = (await client.get("/api/v1/push/config")).json()
    assert cfg["enabled"] is False and cfg["public_key"] is None and cfg["quiet_hours"] == {"from": 22, "to": 7}
    await signup(client)
    r = await client.post("/api/v1/push/subscribe", json=SUB)
    assert r.status_code == 503 and r.json()["code"] == "push.unavailable"
    assert await P.send_pending(None) == {"skipped": "disabled"}  # type: ignore[arg-type]


async def test_subscribe_and_unsubscribe(client, db, keys):
    assert (await client.get("/api/v1/push/config")).json()["public_key"] == "BTestPublicKey"
    # Guests can't get notifications (A7).
    await client.post("/api/v1/auth/guest", json={})
    assert (await client.post("/api/v1/push/subscribe", json=SUB)).status_code == 403
    u = await signup(client)
    assert (await client.post("/api/v1/push/subscribe", json=SUB)).json()["push_on"] is True
    assert (await client.post("/api/v1/push/subscribe", json={**SUB, "tz_offset_min": 330})).status_code == 200
    rows = (await db.execute(select(PushSubscription))).scalars().all()
    assert len(rows) == 1 and rows[0].tz_offset_min == 330
    assert (await db.get(Profile, uuid.UUID(u["id"]))).push_on is True
    bad = await client.post("/api/v1/push/subscribe", json={**SUB, "endpoint": "http://insecure.example.org/x"})
    assert bad.status_code == 400
    off = await client.post("/api/v1/push/unsubscribe", json={"endpoint": SUB["endpoint"]})
    assert off.json() == {"ok": True, "push_on": False}
    db.expire_all()
    assert (await db.get(Profile, uuid.UUID(u["id"]))).push_on is False


def test_quiet_hours_follow_local_time():
    dhaka = 360
    assert P.is_quiet(datetime(2026, 11, 8, 16, 30, tzinfo=UTC), dhaka)  # 22:30 in Dhaka
    assert P.is_quiet(datetime(2026, 11, 8, 0, 30, tzinfo=UTC), dhaka)  # 06:30
    assert not P.is_quiet(datetime(2026, 11, 8, 1, 0, tzinfo=UTC), dhaka)  # 07:00
    assert not P.is_quiet(datetime(2026, 11, 8, 15, 59, tzinfo=UTC), dhaka)  # 21:59


def test_push_text_is_private_and_localised():
    assert P.text_for("tree_due", "bn") == "একটি গাছ তার ছবির অপেক্ষায়"
    assert P.text_for("comment", "en") == "Someone interacted with you in the community"
    assert P.text_for("unknown_kind", "xx") == "You have a new notification"


async def test_send_holds_quiet_hours_and_prunes_gone(client, db, keys, monkeypatch):
    u = await signup(client)
    await client.post("/api/v1/push/subscribe", json=SUB)
    uid = uuid.UUID(u["id"])
    night = datetime(2026, 11, 7, 17, 0, tzinfo=UTC)  # 23:00 in Dhaka
    day = datetime(2026, 11, 8, 1, 30, tzinfo=UTC)  # 07:30 in Dhaka, still within MAX_AGE
    n = Notification(
        user_id=uid,
        kind="tree_due",
        title={"code": "notif.tree.due_on", "params": {"name": "Neem"}},
        params={},
        created_at=night - timedelta(minutes=10),
    )
    db.add(n)
    await db.commit()

    sent: list[dict] = []

    def fake_send(sub, payload):
        sent.append(payload)
        return status["code"]

    status = {"code": 201}
    monkeypatch.setattr(P, "_send_one", fake_send)

    r = await P.send_pending(db, now=night)
    assert r["held_quiet"] == 1 and not sent
    await db.refresh(n)
    assert n.pushed_at is None

    r = await P.send_pending(db, now=day)
    assert r["sent"] == 1 and len(sent) == 1
    assert sent[0]["body"] == "A tree is waiting for its photo" and "Neem" not in str(sent[0])
    await db.refresh(n)
    assert n.pushed_at is not None
    assert (await P.send_pending(db, now=day))["notifications"] == 0

    # A gone subscription (410) is deleted.
    n2 = Notification(user_id=uid, kind="like", title={"code": "x"}, params={}, created_at=day - timedelta(minutes=5))
    db.add(n2)
    await db.commit()
    status["code"] = 410
    r = await P.send_pending(db, now=day)
    assert r["gone"] == 1
    assert (await db.execute(select(PushSubscription))).first() is None
