"""Actions, reviews, trees, points ledger, invites and device import through the API (§6.7, §7.11)."""

import io
import json
from datetime import UTC, datetime, timedelta

import numpy as np
import pytest
from PIL import Image
from sqlalchemy import select, text, update
from sqlalchemy.exc import DBAPIError

from app.errors import AppError
from app.models import PointsLedger, Tree, User
from app.services import points as PTS
from tests.conftest import make_client, signup

DHAKA = (23.7806, 90.4078)


def jpeg(seed: int, green: bool = True) -> bytes:
    rng = np.random.default_rng(seed)
    a = rng.integers(0, 255, (96, 96, 3), dtype=np.uint8)
    if green:
        a[..., 1] = np.clip(a[..., 1].astype(int) + 140, 0, 255)
        a[..., 0] //= 3
        a[..., 2] //= 3
    out = io.BytesIO()
    Image.fromarray(a).save(out, "JPEG")
    return out.getvalue()


async def multipart(c, url: str, data: dict, photo: bytes | None = None, files: list | None = None):
    ct = c.headers.pop("content-type", None)
    try:
        fl = list(files or [])
        if photo is not None:
            fl.append(("photo", ("p.jpg", photo, "image/jpeg")))
        return await c.post(url, data={k: str(v) for k, v in data.items() if v is not None}, files=fl or None)
    finally:
        if ct:
            c.headers["content-type"] = ct


def plant(qty=1, **kw) -> dict:
    d = {
        "action_type": "plant_tree",
        "quantity": qty,
        "lat": DHAKA[0],
        "lng": DHAKA[1],
        "accuracy_m": 12,
        "taken_at": datetime.now(UTC).isoformat(),
        "capture_source": "camera",
        "species_id": "neem",
        "nickname": "Neem",
    }
    d.update(kw)
    return d


async def make_role(db, email: str, role: str) -> None:
    await db.execute(update(User).where(User.email == email).values(role=role))
    await db.commit()


async def test_guest_cannot_log(client, seeded):
    r0 = await client.post("/api/v1/auth/guest", json={})
    assert r0.status_code == 200, r0.text
    r = await multipart(client, "/api/v1/actions", plant(), jpeg(1))
    assert r.status_code == 403 and r.json()["code"] == "auth.guest_restricted"


async def test_verified_planting_earns_pending_points(client, seeded):
    await signup(client)
    r = await multipart(client, "/api/v1/actions", plant(2, client_id="c-1"), jpeg(1))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["log"]["status"] == "verified", body["log"]["checks"]
    assert body["log"]["points"] == 100 and len(body["trees"]) == 2
    assert body["trees"][0]["nickname"] == "Neem 1" and body["trees"][0]["state"] in ("healthy", "due")
    assert {c["code"] for c in body["log"]["checks"]} >= {"gps_present", "time_recent", "content_plausible"}
    # Same client id → same action, no second award.
    again = await multipart(client, "/api/v1/actions", plant(2, client_id="c-1"), jpeg(1))
    assert again.json()["log"]["id"] == body["log"]["id"]
    s = (await client.get("/api/v1/me/stats")).json()
    assert s["points"]["pending"] == 100 and s["points"]["spendable"] == 0
    assert s["points"]["next_unlock_at"] is not None
    assert s["trees"] == 2 and s["trees_alive"] == 2
    assert any(b["id"] == "first_seed" and b["earned"] for b in s["badges"])
    mine = (await client.get("/api/v1/trees/mine")).json()
    assert len(mine) == 2 and mine[0]["photo_url"].startswith("/media/photos/")
    photo = await client.get(mine[0]["photo_url"])
    assert photo.status_code == 200 and photo.headers["cache-control"] == "private, no-store"


async def test_failed_checks_wait_for_review_by_someone_else(client, client2, db, seeded):
    await signup(client)
    # An upload with no EXIF fails the capture check → pending, no points yet.
    r = await multipart(client, "/api/v1/actions", plant(1, capture_source="upload"), jpeg(2))
    a = r.json()["log"]
    assert a["status"] == "pending" and a["reason_code"] == "exif_mismatch"
    assert (await client.get("/api/v1/me/stats")).json()["points"]["pending"] == 0
    # The owner can't confirm their own action.
    own = await client.post(f"/api/v1/actions/{a['id']}/review", json={"approve": True})
    assert own.status_code == 403
    # A stranger can't either, and can't even see it.
    await signup(client2, "rafi@example.org", "Rafi")
    assert (await client2.post(f"/api/v1/actions/{a['id']}/review", json={"approve": True})).status_code == 403
    assert (await client2.get(f"/api/v1/actions/{a['id']}")).status_code == 404
    # A moderator can.
    await make_role(db, "rafi@example.org", "moderator")
    q = (await client2.get("/api/v1/actions/review-queue")).json()
    assert [x["id"] for x in q] == [a["id"]] and q[0]["can_review"]
    ok = await client2.post(f"/api/v1/actions/{a['id']}/review", json={"approve": True})
    assert ok.status_code == 200 and ok.json()["status"] == "verified" and ok.json()["points"] == 50
    assert (await client.get("/api/v1/me/stats")).json()["points"]["pending"] == 50
    # Rejection revokes: a second pending action rejected leaves its tree revoked with no points.
    r2 = await multipart(client, "/api/v1/actions", plant(1, capture_source="upload"), jpeg(3))
    a2 = r2.json()["log"]
    no = await client2.post(f"/api/v1/actions/{a2['id']}/review", json={"approve": False})
    assert no.json()["status"] == "rejected"
    assert len((await client.get("/api/v1/trees/mine")).json()) == 1
    assert (await client.get("/api/v1/me/stats")).json()["points"]["pending"] == 50


async def test_duplicate_photo_is_caught(client, seeded):
    await signup(client)
    img = jpeg(4)
    first = (await multipart(client, "/api/v1/actions", plant(1), img)).json()["log"]
    second = (await multipart(client, "/api/v1/actions", plant(1), img)).json()["log"]
    assert first["status"] == "verified"
    assert second["status"] == "pending" and second["reason_code"] == "duplicate_photo"


async def test_ninety_day_check_in_unlocks_tree_points(client, db, seeded):
    await signup(client)
    r = await multipart(client, "/api/v1/actions", plant(1), jpeg(5))
    tree_id = r.json()["trees"][0]["id"]
    # Simulate the clock: planted 91 days ago, check-in due today.
    now = datetime.now(UTC)
    await db.execute(
        update(Tree).where(Tree.id == tree_id).values(planted_at=now - timedelta(days=91), next_due_at=now)
    )
    await db.commit()
    c = await multipart(
        client,
        f"/api/v1/trees/{tree_id}/checks",
        {"health": "healthy", "height_cm": 80, "lat": DHAKA[0], "lng": DHAKA[1]},
        jpeg(6),
    )
    assert c.status_code == 200, c.text
    t = c.json()
    assert t["check"]["on_time"] and t["check"]["points"] == 10
    assert "d90" in t["milestones"]
    assert t["next_due_at"] > now.isoformat() and len(t["checks"]) == 1 and t["tips"]
    s = (await client.get("/api/v1/me/stats")).json()
    # PT1 50 + PT2 10 unlocked by the 90-day check-in, plus PT3 50 (spendable on award).
    assert s["points"] == {**s["points"], "pending": 0, "spendable": 110}
    assert any(b["id"] == "survivor_3m" and b["earned"] for b in s["badges"])
    # A late, off-schedule check-in earns nothing.
    late = await multipart(client, f"/api/v1/trees/{tree_id}/checks", {"health": "healthy"}, jpeg(7))
    assert late.json()["check"]["points"] == 0 and not late.json()["check"]["on_time"]


async def test_spending_never_overdraws_and_ledger_is_append_only(client, db, seeded):
    u = await signup(client)
    import uuid

    uid = uuid.UUID(u["id"])
    await PTS.earn(db, uid, 60, rule_id="PT3", source_type="tree", source_id="t1", state="spendable")
    await PTS.earn(db, uid, 40, rule_id="PT4", source_type="tree_y1", source_id="t1", state="spendable")
    await db.commit()
    await PTS.spend(db, uid, 70, source_type="redemption", source_id="r1")
    await db.commit()
    with pytest.raises(AppError) as e:
        await PTS.spend(db, uid, 31, source_type="redemption", source_id="r2")
    assert e.value.code == "points.insufficient"
    await db.rollback()
    b = await PTS.balances(db, uid)
    assert b["spendable"] == 30 and b["spent"] == 70
    assert await PTS.earned(db, uid) == 100
    # Oldest award spent first: PT3 fully, PT4 partly.
    spent = (
        await db.execute(
            select(PointsLedger.rule_id, PointsLedger.amount).where(
                PointsLedger.kind == "spend", PointsLedger.amount > 0
            )
        )
    ).all()
    assert sorted(spent) == [("PT3", 60), ("PT4", 10)]
    with pytest.raises(DBAPIError):
        await db.execute(text("update points_ledger set amount = 1"))
    await db.rollback()


async def test_non_tree_points_unlock_after_ninety_days(client, db, seeded):
    u = await signup(client)
    import uuid

    r = await multipart(
        client,
        "/api/v1/actions",
        {**plant(1), "action_type": "water_tree", "species_id": None, "nickname": None},
        jpeg(8),
    )
    assert r.json()["log"]["status"] == "verified" and r.json()["log"]["points"] == 5
    uid = uuid.UUID(u["id"])
    assert await PTS.unlock_due(db, datetime.now(UTC) + timedelta(days=89)) == 0
    assert await PTS.unlock_due(db, datetime.now(UTC) + timedelta(days=91)) == 5
    await db.commit()
    b = await PTS.balances(db, uid)
    assert b["spendable"] == 5 and b["pending"] == 0
    # Idempotent: nothing left to unlock.
    assert await PTS.unlock_due(db, datetime.now(UTC) + timedelta(days=92)) == 0


async def test_deleting_a_tree_revokes_its_points(client, seeded):
    await signup(client)
    r = await multipart(client, "/api/v1/actions", plant(1), jpeg(9))
    tid = r.json()["trees"][0]["id"]
    assert (await client.delete(f"/api/v1/trees/{tid}")).status_code == 204
    s = (await client.get("/api/v1/me/stats")).json()
    assert s["points"]["pending"] == 0 and s["points"]["earned"] == 0 and s["trees"] == 0


async def test_invite_a_friend_to_water_and_pt7(client, client2, db, seeded):
    a = await signup(client)
    r = await multipart(client, "/api/v1/actions", plant(1), jpeg(10))
    tid = r.json()["trees"][0]["id"]
    inv = (await client.post(f"/api/v1/trees/{tid}/invite")).json()
    assert inv["path"].startswith("/app/tree/join?t=")
    await signup(client2, "rafi@example.org", "Rafi")
    assert (await client2.get(f"/api/v1/trees/{tid}")).status_code == 404
    ok = await client2.post("/api/v1/trees/invites/accept", json={"token": inv["token"]})
    assert ok.status_code == 200 and ok.json()["id"] == tid
    assert len((await client2.get("/api/v1/trees/helping")).json()) == 1
    # The helper may check in; they can't edit or delete it.
    c = await multipart(client2, f"/api/v1/trees/{tid}/checks", {"health": "healthy"}, jpeg(11))
    assert c.status_code == 200
    assert (await client2.patch(f"/api/v1/trees/{tid}", json={"nickname": "Mine"})).status_code == 403
    # PT7: the friend's first verified planting earns the inviter 25 (pending).
    await multipart(client2, "/api/v1/actions", plant(1), jpeg(12))
    import uuid

    b = await PTS.balances(db, uuid.UUID(a["id"]))
    assert b["pending"] == 50 + 25
    bad = await client2.post("/api/v1/trees/invites/accept", json={"token": inv["token"] + "x"})
    assert bad.status_code == 400 and bad.json()["code"] == "tree.invite_invalid"


async def test_manual_tree_patch_and_state(client, seeded):
    await signup(client)
    planted = (datetime.now(UTC) - timedelta(days=30)).isoformat()
    r = await multipart(
        client,
        "/api/v1/trees",
        {"species_id": "neem", "nickname": "Corner", "planted_at": planted, "lat": DHAKA[0], "lng": DHAKA[1]},
        jpeg(13),
    )
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["verified"] and t["action_id"] is None and t["checks"] == []
    p = await client.patch(f"/api/v1/trees/{t['id']}", json={"nickname": "Corner neem"})
    assert p.json()["nickname"] == "Corner neem"
    assert (await client.patch(f"/api/v1/trees/{t['id']}", json={"species_id": "nope"})).status_code == 400
    dead = await multipart(client, f"/api/v1/trees/{t['id']}/checks", {"health": "dead"}, jpeg(14))
    assert dead.json()["state"] == "lost" and dead.json()["check"]["points"] == 0


async def test_device_import_is_idempotent(client, seeded):
    await signup(client)
    now = datetime.now(UTC)
    payload = {
        "goals": [
            {
                "id": "g1",
                "zone_centroid": {"lat": DHAKA[0], "lng": DHAKA[1]},
                "zone_name": "Old zone",
                "target_c": -1.0,
                "by_date": (now + timedelta(days=400)).date().isoformat(),
            }
        ],
        "actions": [
            {
                "id": "a1",
                "action_type": "plant_tree",
                "quantity": 1,
                "lat": DHAKA[0],
                "lng": DHAKA[1],
                "taken_at": (now - timedelta(days=20)).isoformat(),
                "photo_key": "k1",
                "created_at": (now - timedelta(days=20)).isoformat(),
            }
        ],
        "trees": [
            {
                "id": "ATX-26-AAAA",
                "species_id": "neem",
                "nickname": "Old neem",
                "planted_at": (now - timedelta(days=20)).isoformat(),
                "location": {"lat": DHAKA[0], "lng": DHAKA[1]},
                "photo_key": "k1",
                "action_id": "a1",
            }
        ],
        "checks": [
            {
                "id": "c1",
                "tree_id": "ATX-26-AAAA",
                "health": "healthy",
                "created_at": (now - timedelta(days=5)).isoformat(),
                "photo_key": "k2",
            }
        ],
        "fields": [
            {
                "id": "f1",
                "name": "North plot",
                "crop": "rice",
                "stage": "veg",
                "location": {"lat": 24.0, "lng": 90.0},
                "area": 1.5,
            }
        ],
    }
    files = [("photo:k1", ("k1.jpg", jpeg(15), "image/jpeg")), ("photo:k2", ("k2.jpg", jpeg(16), "image/jpeg"))]
    r = await multipart(client, "/api/v1/me/import", {"payload": json.dumps(payload)}, files=files)
    assert r.status_code == 200, r.text
    assert r.json() == {
        "goals": 0,
        "drafts": 1,
        "trees": 1,
        "actions": 1,
        "checks": 1,
        "fields": 1,
        "photos": 2,
        "skipped": 0,
    }
    again = await multipart(client, "/api/v1/me/import", {"payload": json.dumps(payload)}, files=files)
    assert again.json()["trees"] == 0 and again.json()["actions"] == 0 and again.json()["checks"] == 0
    trees = (await client.get("/api/v1/trees/mine")).json()
    assert len(trees) == 1 and trees[0]["state"] == "verifying"  # waits for the imported planting's review
    acts = (await client.get("/api/v1/actions/mine")).json()
    assert acts[0]["status"] == "pending" and acts[0]["reason_code"] == "imported"
    assert (await client.get("/api/v1/me/stats")).json()["points"]["earned"] == 0
    bad = await multipart(client, "/api/v1/me/import", {"payload": "{not json"}, files=files[:1])
    assert bad.status_code == 400 and bad.json()["code"] == "import.invalid"


async def test_avatar_upload_is_moderated(client, seeded):
    await signup(client)
    r = await multipart(client, "/api/v1/me/avatar", {}, jpeg(17))
    assert r.status_code == 200 and r.json()["moderation"] == "pending"
    url = r.json()["avatar_url"]
    assert (await client.get(url)).status_code == 200  # owner sees it
    async with make_client() as other:
        await other.post("/api/v1/auth/guest", json={})
        assert (await other.get(url)).status_code == 404  # others wait for approval


async def test_daily_reminders_are_sent_once_per_due_date(client, db, seeded):
    from app.jobs import daily
    from app.models import Notification

    await signup(client)
    r = await multipart(client, "/api/v1/actions", plant(1), jpeg(18))
    tid = r.json()["trees"][0]["id"]
    now = datetime.now(UTC)
    await db.execute(
        update(Tree)
        .where(Tree.id == tid)
        .values(next_due_at=now + timedelta(days=1), planted_at=now - timedelta(days=88))
    )
    await db.commit()
    first = await daily.tree_reminders(db, None)
    second = await daily.tree_reminders(db, None)
    assert first["notified"] == 2 and second["notified"] == 2  # due + 90-day nudge, attempted twice
    kinds = (await db.execute(select(Notification.title).where(Notification.kind == "tree_due"))).scalars().all()
    assert sorted(k["code"] for k in kinds) == ["notif.tree.d90_due", "notif.tree.due"]  # deduplicated
    assert (await daily.points_unlock(db, None))["unlocked"] == 0
