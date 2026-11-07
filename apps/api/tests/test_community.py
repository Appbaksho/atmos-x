"""Community (§6.8): teams, chat, PT6, leaderboards, feed, likes, comments, mentions, follows, blocks,
reports and moderation, events, notifications, public profiles, demo separation and E5."""

import pathlib
import re
import uuid
from datetime import UTC, date, datetime, timedelta

import respx
from sqlalchemy import select, update

from app.models import Goal, Mention, Notification, User
from app.services import points as PTS
from tests.conftest import make_client, signup
from tests.test_act import DHAKA, jpeg, multipart, plant
from tests.test_plan_goals import _zone
from tests.test_zones import mock_upstreams

HOME = {"lat": DHAKA[0], "lng": DHAKA[1]}


async def person(c, email, name, home=HOME, city="Dhaka"):
    u = await signup(c, email, name)
    r = await c.patch("/api/v1/me/profile", json={"home": home, "area": "Mohammadpur"})
    assert r.status_code == 200, r.text
    return u


async def set_city(db, uid, city="Dhaka", country="BD"):
    from app.models import Profile

    await db.execute(update(Profile).where(Profile.user_id == uuid.UUID(uid)).values(city=city, country_code=country))
    await db.commit()


async def test_teams_join_chat_leave(client, client2, db, seeded):
    await person(client, "a@example.org", "Asha")
    t = (
        await client.post("/api/v1/teams", json={"name": "Lane Greeners", "max_members": 2, "is_public": False})
    ).json()
    assert t["is_member"] and t["my_role"] == "lead" and t["code"] and t["members"][0]["display_name"] == "Asha"
    async with make_client() as c3:
        await person(client2, "b@example.org", "Babul")
        await person(c3, "c@example.org", "Chaya")
        # Private: no join by id; by code works; the third person finds it full.
        assert (await client2.post(f"/api/v1/teams/{t['id']}/join")).json()["code"] == "team.private"
        prev = (await client2.get(f"/api/v1/teams/by-code/{t['code']}")).json()
        assert prev["name"] == "Lane Greeners" and prev["code"] is None
        j = await client2.post("/api/v1/teams/join-by-code", json={"code": t["code"].lower()})
        assert j.status_code == 200 and len(j.json()["members"]) == 2
        full = await c3.post("/api/v1/teams/join-by-code", json={"code": t["code"]})
        assert full.status_code == 409 and full.json()["code"] == "team.full"
        assert (await c3.get(f"/api/v1/teams/{t['id']}/messages")).status_code == 403
    m = await client2.post(f"/api/v1/teams/{t['id']}/messages", json={"body": "Water the neem at 6?"})
    assert m.status_code == 200 and m.json()["mine"]
    since = m.json()["created_at"]
    await client.post(f"/api/v1/teams/{t['id']}/messages", json={"body": "Yes!"})
    newer = (await client2.get(f"/api/v1/teams/{t['id']}/messages", params={"since": since})).json()
    assert [x["body"] for x in newer] == ["Yes!"] and not newer[0]["mine"]
    assert (await client.get(f"/api/v1/teams/{t['id']}/invite")).json() == {
        "code": t["code"],
        "url": f"/join/{t['code']}",
    }
    # The lead leaves: the other member becomes lead.
    assert (await client.delete(f"/api/v1/teams/{t['id']}/members/me")).status_code == 204
    after = (await client2.get(f"/api/v1/teams/{t['id']}")).json()
    assert after["my_role"] == "lead" and len(after["members"]) == 1
    n = (await db.execute(select(Notification).where(Notification.kind == "team_invite"))).scalars().all()
    assert len(n) == 1


@respx.mock
async def test_team_stats_and_pt6(client, client2, db, seeded):
    mock_upstreams()
    a = await person(client, "a@example.org", "Asha")
    b = await person(client2, "b@example.org", "Babul")
    t = (await client.post("/api/v1/teams", json={"name": "Shade Makers"})).json()
    await client2.post(f"/api/v1/teams/{t['id']}/join")
    z = await _zone(client, db)
    c = z["centroid"]
    g = Goal(
        user_id=uuid.UUID(a["id"]),
        team_id=uuid.UUID(t["id"]),
        zone_id=z["id"],
        zone_name="Test block",
        zone_lat=c["lat"],
        zone_lng=c["lng"],
        target_c=-0.5,
        by_date=date.today() + timedelta(days=400),
        kind="action",
        targets={"trees": 2, "area_km2": 0.2},
        status="active",
    )
    db.add(g)
    await db.commit()
    r = await multipart(
        client, "/api/v1/actions", plant(2, goal_id=str(g.id), team_id=t["id"], lat=c["lat"], lng=c["lng"]), jpeg(30)
    )
    assert r.json()["log"]["status"] == "verified", r.json()["log"]["checks"]
    team = (await client.get(f"/api/v1/teams/{t['id']}")).json()
    assert (
        team["stats"]["trees"] == 2
        and team["stats"]["points"] == 100
        and team["activity"][0]["action_type"] == "plant_tree"
    )
    assert team["goal"]["progress_pct"] == 100
    for uid in (a["id"], b["id"]):
        assert (await PTS.balances(db, uuid.UUID(uid)))["spendable"] >= 100  # PT6 to every member
    s = (await client2.get("/api/v1/me/stats")).json()
    assert any(x["id"] == "team_player" and x["earned"] for x in s["badges"])


async def test_leaderboards_area_month_me_and_demo_separation(client, client2, db, seeded):
    a = await person(client, "a@example.org", "Asha")
    b = await person(client2, "b@example.org", "Babul")
    await PTS.earn(db, uuid.UUID(a["id"]), 120, rule_id="ACTION", source_type="t", source_id="1", state="spendable")
    await PTS.earn(db, uuid.UUID(b["id"]), 80, rule_id="ACTION", source_type="t", source_id="2", state="spendable")
    await PTS.earn(
        db,
        uuid.UUID(b["id"]),
        500,
        rule_id="ACTION",
        source_type="t",
        source_id="3",
        state="spendable",
        at=datetime.now(UTC) - timedelta(days=70),
    )
    far = User(display_name="Far away", role="user")
    demo = User(display_name="Demo person", role="user", is_demo=True)
    db.add_all([far, demo])
    await db.flush()
    from app.models import Profile
    from app.services.profile import point_wkt

    db.add(Profile(user_id=far.id, home_lat=24.9, home_lng=91.8, home_geom=point_wkt(24.9, 91.8)))
    db.add(Profile(user_id=demo.id, home_lat=DHAKA[0], home_lng=DHAKA[1], home_geom=point_wkt(*DHAKA)))
    await PTS.earn(db, far.id, 999, rule_id="ACTION", source_type="t", source_id="4", state="spendable")
    await PTS.earn(db, demo.id, 999, rule_id="ACTION", source_type="t", source_id="5", state="spendable")
    await db.commit()
    month = (
        await client2.get("/api/v1/leaderboard", params={"subject": "user", "scope": "area", "period": "month"})
    ).json()
    assert [r["name"] for r in month["rows"]] == [
        "Asha",
        "Babul",
    ]  # far and demo excluded; Babul's old points don't count
    assert (
        month["me"]["rank"] == 2
        and month["me"]["points"] == 80
        and month["rows"][0]["href"] == {"screen": "user", "id": a["id"]}
    )
    alltime = (
        await client2.get("/api/v1/leaderboard", params={"subject": "user", "scope": "area", "period": "all"})
    ).json()
    assert alltime["rows"][0]["name"] == "Babul" and alltime["me"]["rank"] == 1
    none = (
        await client.get("/api/v1/leaderboard", params={"subject": "user", "scope": "city", "period": "month"})
    ).json()
    assert none["status"] == "no_place"
    await set_city(db, a["id"])
    await set_city(db, b["id"])
    city = (
        await client.get("/api/v1/leaderboard", params={"subject": "user", "scope": "city", "period": "month"})
    ).json()
    assert len(city["rows"]) == 2 and city["me"]["is_me"]


async def test_feed_likes_comments_mentions_follow_block_report_moderate(client, client2, db, seeded):
    a = await person(client, "a@example.org", "Asha")
    b = await person(client2, "b@example.org", "Babul")
    p = await multipart(client, "/api/v1/posts", {"body": "Planted a neem today 🌳"}, jpeg(31))
    assert p.status_code == 200, p.text
    post = p.json()
    assert post["photo_pending"] and post["photo_url"]  # the author sees their own pending photo
    feed_b = (await client2.get("/api/v1/feed", params={"filter": "area"})).json()
    assert [x["id"] for x in feed_b["posts"]] == [post["id"]] and feed_b["posts"][0][
        "photo_url"
    ] is None  # not approved yet
    assert (await client2.post(f"/api/v1/posts/{post['id']}/like")).json() == {"likes": 1, "liked": True}
    c = await client2.post(f"/api/v1/posts/{post['id']}/comments", json={"body": f"Great work @[Asha]({a['id']})!"})
    assert c.status_code == 200 and c.json()["author"]["display_name"] == "Babul"
    assert len((await db.execute(select(Mention))).scalars().all()) == 1
    kinds = sorted(
        n.kind
        for n in (await db.execute(select(Notification).where(Notification.user_id == uuid.UUID(a["id"]))))
        .scalars()
        .all()
    )
    assert kinds == ["comment", "like", "mention"]
    detail = (await client.get(f"/api/v1/posts/{post['id']}")).json()
    assert detail["likes"] == 1 and detail["comments"] == 1 and len(detail["comment_list"]) == 1
    # Following feed
    assert (await client2.get("/api/v1/feed", params={"filter": "following"})).json()["posts"] == []
    await client2.post("/api/v1/follows", json={"user_id": a["id"]})
    assert len((await client2.get("/api/v1/feed", params={"filter": "following"})).json()["posts"]) == 1
    prof = (await client2.get(f"/api/v1/users/{a['id']}")).json()
    assert prof["is_following"] and prof["followers"] == 1 and prof["display_name"] == "Asha"
    # Report → moderator queue → hide → gone for others, still visible to moderators
    r = await client2.post("/api/v1/reports", json={"target_type": "post", "target_id": post["id"], "reason": "spam"})
    assert r.status_code == 200
    await db.execute(update(User).where(User.email == "b@example.org").values(role="moderator"))
    await db.commit()
    q = (await client2.get("/api/v1/moderation/queue")).json()
    assert q["reports"][0]["target_id"] == post["id"] and q["photos"][0]["purpose"] == "post"
    ok = await client2.post(
        "/api/v1/moderation/-", json={"target_type": "photo", "target_id": q["photos"][0]["id"], "action": "approve"}
    )
    assert ok.status_code == 200
    hide = await client2.post(
        f"/api/v1/moderation/{q['reports'][0]['id']}",
        json={"target_type": "post", "target_id": post["id"], "action": "hide"},
    )
    assert hide.status_code == 200
    async with make_client() as c3:
        await person(c3, "c@example.org", "Chaya")
        assert (await c3.get("/api/v1/feed", params={"filter": "area"})).json()["posts"] == []
    assert (await client2.get("/api/v1/moderation/queue")).json()["reports"] == []
    # Block hides people from each other both ways
    p2 = (await multipart(client2, "/api/v1/posts", {"body": "Shade walk Friday"})).json()
    assert "id" in p2, p2
    await client.post("/api/v1/blocks", json={"user_id": b["id"]})
    assert p2["id"] not in [
        x["id"] for x in (await client.get("/api/v1/feed", params={"filter": "area"})).json()["posts"]
    ]
    assert (await client2.get(f"/api/v1/users/{a['id']}")).status_code == 404
    assert (await client.get(f"/api/v1/posts/{p2['id']}")).status_code == 404


async def test_share_a_verified_action_and_new_account_limits(client, db, seeded):
    await person(client, "a@example.org", "Asha")
    act = (await multipart(client, "/api/v1/actions", plant(1), jpeg(32))).json()["log"]
    shared = await multipart(client, "/api/v1/posts", {"action_id": act["id"], "body": ""})
    assert shared.status_code == 200, shared.text
    s = shared.json()
    assert s["action"]["action_type"] == "plant_tree" and s["photo_pending"]
    pend = (await multipart(client, "/api/v1/actions", plant(1, capture_source="upload"), jpeg(33))).json()["log"]
    nope = await multipart(client, "/api/v1/posts", {"action_id": pend["id"]})
    assert nope.status_code == 409 and nope.json()["code"] == "post.action_not_verified"
    for i in range(4):  # 1 shared + 4 = 5 for a new account (the refused one isn't counted)
        assert (await multipart(client, "/api/v1/posts", {"body": f"post {i}"})).status_code == 200
    over = await multipart(client, "/api/v1/posts", {"body": "one too many"})
    assert over.status_code == 429 and over.json()["code"] == "post.daily_limit"


async def test_events_rsvp_checkin_and_reminders(client, client2, db, seeded):
    await person(client, "a@example.org", "Asha")
    await person(client2, "b@example.org", "Babul")
    start = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
    e = await client.post(
        "/api/v1/events",
        json={
            "title": "Lane planting",
            "starts_at": start,
            "place_name": "Asad Gate lane",
            "lat": DHAKA[0],
            "lng": DHAKA[1],
            "capacity": 2,
            "sponsor_name": "Lane Hardware",
        },
    )
    assert e.status_code == 200, e.text
    ev = e.json()
    assert ev["going"] == 1 and ev["my_rsvp"] == "going" and ev["checkin_open"]
    listed = (await client2.get("/api/v1/events", params={"lat": DHAKA[0], "lng": DHAKA[1]})).json()
    assert [x["id"] for x in listed] == [ev["id"]]
    assert (await client2.post(f"/api/v1/events/{ev['id']}/rsvp", json={"status": "going"})).json()["going"] == 2
    async with make_client() as c3:
        await person(c3, "c@example.org", "Chaya")
        full = await c3.post(f"/api/v1/events/{ev['id']}/rsvp", json={"status": "going"})
        assert full.status_code == 409 and full.json()["code"] == "event.full"
    far = await client2.post(f"/api/v1/events/{ev['id']}/checkin", json={"lat": DHAKA[0] + 0.01, "lng": DHAKA[1]})
    assert far.status_code == 409 and far.json()["code"] == "event.too_far"
    ok = await client2.post(
        f"/api/v1/events/{ev['id']}/checkin", json={"lat": DHAKA[0] + 0.001, "lng": DHAKA[1], "accuracy_m": 10}
    )
    assert ok.status_code == 200 and ok.json()["i_checked_in"] and ok.json()["checked_in"] == 1
    # R3: the organizer adds the sponsor logo; others see it only after moderation.
    from tests.test_act import jpeg, multipart

    logo = await multipart(client, f"/api/v1/events/{ev['id']}/sponsor-logo", {}, jpeg(7))
    assert logo.status_code == 200 and logo.json()["sponsor_logo_url"]
    assert (await client2.get(f"/api/v1/events/{ev['id']}")).json()["sponsor_logo_url"] is None
    assert (await multipart(client2, f"/api/v1/events/{ev['id']}/sponsor-logo", {}, jpeg(8))).status_code == 403
    # A participation certificate for people who checked in, and only for them.
    cert = await client2.get(f"/api/v1/events/{ev['id']}/certificate.pdf")
    assert cert.status_code == 200 and cert.content[:4] == b"%PDF"
    assert (await client.get(f"/api/v1/events/{ev['id']}/certificate.pdf")).status_code == 403
    past = await client.post(
        "/api/v1/events",
        json={
            "title": "Old",
            "starts_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
            "place_name": "Old place",
            "lat": 1,
            "lng": 1,
        },
    )
    assert past.status_code == 400
    from app.services import events as EV

    assert await EV.remind(db) == 2 and await EV.remind(db) == 0
    unread = (await client2.get("/api/v1/notifications")).json()
    assert unread["unread"] >= 1 and unread["items"][0]["title"]["code"] == "notif.event.reminder"
    assert (await client2.post("/api/v1/notifications/read", json={})).json()["marked"] >= 1
    assert (await client2.get("/api/v1/notifications")).json()["unread"] == 0


async def test_orgs_and_team_board(client, client2, db, seeded):
    await person(client, "a@example.org", "Asha")
    o = (
        await client.post(
            "/api/v1/orgs", json={"name": "Lakeside School Club", "kind": "school", "city": "Dhaka", "country": "bd"}
        )
    ).json()
    assert o["my_role"] == "admin" and o["country"] == "BD" and not o["verified"]
    t = (await client.post("/api/v1/teams", json={"name": "Class 9 Greeners", "org_id": o["id"]})).json()
    await multipart(client, "/api/v1/actions", plant(1, team_id=t["id"]), jpeg(34))
    org = (await client.get(f"/api/v1/orgs/{o['id']}")).json()
    assert (
        org["totals"]["trees"] == 1 and org["totals"]["points"] == 50 and org["teams"][0]["name"] == "Class 9 Greeners"
    )
    teams = (
        await client.get("/api/v1/leaderboard", params={"subject": "team", "scope": "area", "period": "month"})
    ).json()
    assert teams["rows"][0]["name"] == "Class 9 Greeners" and teams["me"]["is_me"]
    await set_city(db, (await client.get("/api/v1/auth/me")).json()["id"])
    orgs = (
        await client.get("/api/v1/leaderboard", params={"subject": "org", "scope": "country", "period": "all"})
    ).json()
    assert orgs["rows"][0]["href"] == {"screen": "S18", "id": o["id"]}
    assert len((await client2.get("/api/v1/orgs")).json()) == 1


async def test_demo_user_sees_only_the_demo_community(client, client2, db, seeded):
    r = await client.post("/api/v1/auth/demo", json={})
    assert r.status_code == 200, r.text
    board = (
        await client.get("/api/v1/leaderboard", params={"subject": "user", "scope": "area", "period": "all"})
    ).json()
    names = [x["name"] for x in board["rows"]]
    assert "Tanvir Hossain" in names
    teams = (
        await client.get("/api/v1/leaderboard", params={"subject": "team", "scope": "area", "period": "all"})
    ).json()
    assert any(x["name"] == "Ward 7 Volunteers" for x in teams["rows"])
    assert len((await client.get("/api/v1/feed", params={"filter": "area"})).json()["posts"]) >= 3
    assert len((await client.get("/api/v1/events")).json()) == 1
    mine = (await client.get("/api/v1/trees/mine")).json()
    assert len(mine) == 4 and any(t["status"] != "ok" for t in mine)
    stats = (await client.get("/api/v1/me/stats")).json()
    assert stats["points"]["earned"] > 0
    # A real person sees none of it.
    await person(client2, "real@example.org", "Real Person")
    real = (
        await client2.get("/api/v1/leaderboard", params={"subject": "user", "scope": "area", "period": "all"})
    ).json()
    assert all(x["name"] != "Tanvir Hossain" for x in real["rows"])
    assert (await client2.get("/api/v1/feed", params={"filter": "area"})).json()["posts"] == []
    # A second demo session reuses the shared community.
    async with make_client() as c3:
        assert (await c3.post("/api/v1/auth/demo", json={})).status_code == 200
    assert len((await db.execute(select(User).where(User.display_name == "Tanvir Hossain"))).scalars().all()) == 1


BANNED = [
    "BRAC University Eco Club",
    "DNCC Ward 33",
    "Bidyanondo Green",
    "BUET Green Club",
    "Dhaka North City Corporation",
    "Dhaka South City Corporation",
    "DU Green Society",
    "PRAN",
]


def test_e5_no_real_organizations_in_seeds_or_messages():
    root = pathlib.Path(__file__).resolve().parents[3]
    targets = [
        root / "apps/api/app",
        root / "apps/api/scripts",
        root / "apps/web/src/i18n/messages",
        root / "apps/web/src/lib/data",
    ]
    hits = []
    for base in targets:
        if not base.exists():
            continue
        for f in base.rglob("*"):
            if f.suffix not in (".py", ".json", ".ts", ".tsx") or not f.is_file():
                continue
            txt = f.read_text(errors="ignore")
            for name in BANNED:
                pat = rf"\b{re.escape(name)}\b"
                if re.search(pat, txt):
                    hits.append(f"{f.relative_to(root)}: {name}")
    assert hits == [], hits
