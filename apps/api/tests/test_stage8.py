"""Stage 8 gaps: moderation fails closed, and leaderboards reset on Dhaka calendar boundaries."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
import respx

from app.config import settings
from app.errors import AppError
from app.models import Photo
from app.services import leaderboard as LB
from app.services import photos as PH

VISION = "https://vision.googleapis.com/v1/images:annotate"


@pytest.fixture
def vision(monkeypatch):
    monkeypatch.setattr(settings, "moderation_provider", "google_vision")
    monkeypatch.setattr(settings, "google_vision_api_key", "test-key")


def _safe(adult: str, violence: str = "VERY_UNLIKELY") -> httpx.Response:
    return httpx.Response(200, json={"responses": [{"safeSearchAnnotation": {"adult": adult, "violence": violence}}]})


@respx.mock
async def test_vision_failure_keeps_the_photo_in_the_queue(db, vision):
    respx.post(VISION).mock(side_effect=httpx.ConnectError("down"))
    p = Photo(moderation="pending")
    await PH.moderate(db, p, b"jpeg")
    assert p.moderation == "pending"


@respx.mock
async def test_vision_bad_answer_keeps_the_photo_in_the_queue(db, vision):
    respx.post(VISION).mock(return_value=httpx.Response(200, json={"unexpected": True}))
    p = Photo(moderation="pending")
    await PH.moderate(db, p, b"jpeg")
    assert p.moderation == "pending"


@respx.mock
async def test_vision_rejects_flagged_and_approves_clean(db, vision):
    route = respx.post(VISION)
    route.mock(return_value=_safe("VERY_LIKELY"))
    flagged = Photo(moderation="pending")
    await PH.moderate(db, flagged, b"jpeg")
    assert flagged.moderation == "rejected" and flagged.moderation_reason == "vision:adult"
    route.mock(return_value=_safe("UNLIKELY"))
    clean = Photo(moderation="pending")
    await PH.moderate(db, clean, b"jpeg")
    assert clean.moderation == "approved"


async def test_manual_moderation_never_calls_out(db, monkeypatch):
    monkeypatch.setattr(settings, "moderation_provider", "manual")
    p = Photo(moderation="pending")
    await PH.moderate(db, p, b"jpeg")
    assert p.moderation == "pending"


def test_week_starts_monday_midnight_in_dhaka():
    # Sunday 20:00 UTC is already Monday 02:00 in Dhaka: the new week has begun.
    assert LB.period_start("week", datetime(2026, 11, 8, 20, 0, tzinfo=UTC)) == datetime(2026, 11, 8, 18, 0, tzinfo=UTC)
    # Sunday 17:59 UTC is Sunday 23:59 in Dhaka: still the previous week (from Monday 2 Nov).
    assert LB.period_start("week", datetime(2026, 11, 8, 17, 59, tzinfo=UTC)) == datetime(
        2026, 11, 1, 18, 0, tzinfo=UTC
    )


def test_month_starts_on_the_first_in_dhaka():
    # 30 Nov 19:00 UTC is 1 Dec 01:00 in Dhaka: December's board.
    assert LB.period_start("month", datetime(2026, 11, 30, 19, 0, tzinfo=UTC)) == datetime(
        2026, 11, 30, 18, 0, tzinfo=UTC
    )
    assert LB.period_start("month", datetime(2026, 11, 30, 17, 0, tzinfo=UTC)) == datetime(
        2026, 10, 31, 18, 0, tzinfo=UTC
    )
    assert LB.period_start("all") is None
    with pytest.raises(AppError):
        LB.period_start("year")


@respx.mock
async def test_place_search_degrades_without_an_error(client):
    """The geocoder being down answers 200 with no results and live=false (the app then uses its own city list)."""
    respx.get(url__regex=r"https://(customer-)?geocoding-api\.open-meteo\.com/.*").mock(
        return_value=httpx.Response(503)
    )
    r = await client.get("/api/v1/geo/search", params={"q": "Nowhereville-xyz", "lang": "en"})
    assert r.status_code == 200
    assert r.json()["results"] == [] and r.json()["meta"]["live"] is False


async def test_heat_warnings_notify_each_home_area_once_a_day(client, db, monkeypatch):
    """C12: a BMD heat-wave warning at someone's home area becomes one notification a day."""
    import uuid
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.models import Notification, Profile
    from app.services import conditions as C
    from app.services import heat_alerts as HA
    from tests.conftest import signup

    u = await signup(client)
    prof = await db.get(Profile, uuid.UUID(u["id"]))
    prof.home_lat, prof.home_lng, prof.city = 23.759, 90.359, "Mohammadpur"
    await db.commit()
    hot = {
        "place": "Lalmatia, Dhaka",
        "forecast": [{"feels_max_c": 44.2, "tmax_c": 39.1}, {"feels_max_c": 41.0}, {"feels_max_c": 40.0}],
        "warnings": [
            {
                "source": "local",
                "level": "severe",
                "text": {"code": "warning.heatwave_severe", "params": {}},
                "until": "2026-04-18",
            }
        ],
    }
    calm = {"place": "Lalmatia, Dhaka", "forecast": [{"feels_max_c": 31.0}], "warnings": []}
    answer = {"v": calm}

    async def fake_conditions(db_, lat, lng, lang):
        return answer["v"]

    monkeypatch.setattr(C, "conditions", fake_conditions)
    now = datetime(2026, 4, 16, 1, 0, tzinfo=UTC)
    assert (await HA.run(db, now))["notified"] == 0
    answer["v"] = hot
    assert (await HA.run(db, now))["notified"] == 1
    await HA.run(db, now)  # same day: no second notification
    rows = (await db.execute(select(Notification).where(Notification.kind == "heat_warning"))).scalars().all()
    assert len(rows) == 1 and rows[0].title == {
        "code": "notif.heat.warning",
        "params": {"place": "Mohammadpur", "feels": 44},
    }
    # Guests are never notified, even with a home in a warned area.
    await client.post("/api/v1/auth/logout")
    g = (await client.post("/api/v1/auth/guest", json={})).json()["user"]
    gp = await db.get(Profile, uuid.UUID(g["id"]))
    gp.home_lat, gp.home_lng = 23.76, 90.36
    await db.commit()
    await HA.run(db, datetime(2026, 4, 17, 1, 0, tzinfo=UTC))
    guest_rows = (
        (await db.execute(select(Notification).where(Notification.user_id == uuid.UUID(g["id"])))).scalars().all()
    )
    assert guest_rows == []
    assert HA.cell_of(23.759, 90.359) == (23.75, 90.35)


async def test_org_admin_exports_team_numbers_as_csv(client):
    """R9: an org's admin downloads its teams' numbers; nobody else can."""
    from tests.conftest import signup

    await signup(client, "orgadmin@example.org", "Org Admin")
    org = (await client.post("/api/v1/orgs", json={"name": "Lane School Eco Club", "kind": "school"})).json()
    team = await client.post(
        "/api/v1/teams", json={"name": "Class Seven Planters", "is_public": True, "org_id": org["id"]}
    )
    assert team.status_code == 200, team.text
    r = await client.get(f"/api/v1/orgs/{org['id']}/export.csv")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0] == "team,public,points,trees,actions,cooling_c_estimate"
    assert lines[1].startswith("Class Seven Planters,True,")
    await client.post("/api/v1/auth/logout")
    await signup(client, "someone@example.org", "Someone")
    assert (await client.get(f"/api/v1/orgs/{org['id']}/export.csv")).status_code == 403
