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
