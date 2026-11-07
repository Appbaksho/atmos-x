"""Ask Atmos without an LLM (§6.12): intents in 10 languages, SSE contract, limits, feedback."""

import json

import httpx
import pytest
import respx
from sqlalchemy import select

from app.models import AskMessage
from app.services.ask import CHIPS, classify
from tests.conftest import signup
from tests.heatfix import DHAKA, seed_cells
from tests.test_farm import om_forecast
from tests.test_zones import NOMINATIM


@pytest.mark.parametrize(
    ("msg", "intent"),
    [
        ("আমার এলাকা এত গরম কেন?", "why_hot"),
        ("Why is my area so hot?", "why_hot"),
        ("میرا علاقہ اتنا گرم کیوں ہے؟", "why_hot"),
        ("لماذا الجو حار جدا هنا؟", "why_hot"),
        ("मेरा इलाका इतना गर्म क्यों है?", "why_hot"),
        ("¿Por qué hace tanto calor aquí?", "why_hot"),
        ("Pourquoi fait-il si chaud ici ?", "why_hot"),
        ("Por que está tão quente aqui?", "why_hot"),
        ("Kenapa di sini panas sekali?", "why_hot"),
        ("为什么这里这么热？", "why_hot"),
        ("How is the air quality today?", "air_now"),
        ("বাতাসের অবস্থা কেমন?", "air_now"),
        ("Should I wear a mask outside?", "air_advice"),
        ("Will it rain tomorrow?", "forecast"),
        ("Is today hotter than normal?", "normal"),
        ("What is the temperature right now?", "temp_now"),
        ("Any risk for my boro rice field?", "farm_alerts"),
        ("ধানের জমিতে কোনো সতর্কতা আছে?", "farm_alerts"),
        ("When is my next tree check-in?", "tree_due"),
        ("How much water does my tree need?", "tree_care"),
        ("Where is the nearest nursery?", "nurseries"),
        ("Which tree should I plant here?", "species"),
        ("How is my goal progress?", "goal_progress"),
        ("How many points do I have?", "points"),
        ("Where does your data come from?", "data_sources"),
        ("How much urea should I give my boro?", "safety_chemicals"),
        ("কতটুকু কীটনাশক দেব?", "safety_chemicals"),
        ("I feel dizzy and have a headache", "safety_medical"),
        ("please tell me the meaning of life and everything", "unknown"),
    ],
)
def test_classify(msg, intent):
    assert classify(msg, "S04") == intent


def test_short_follow_ups_use_the_screen_topic():
    assert classify("why?", "S26") == "air_now"
    assert classify("and tomorrow?", "S04") == "forecast"
    assert classify("ok", "F02") == "farm_alerts"
    assert classify("ok", "S04", farmer=True) == "farm_alerts"
    assert classify("", "S20") == "tree_due"
    assert set(CHIPS["unknown"]) <= set(CHIPS) | {"tree_due"}


def events(text: str) -> list[dict]:
    out = []
    for block in text.strip().split("\n\n"):
        data = [ln[6:] for ln in block.splitlines() if ln.startswith("data: ")]
        if data:
            out.append(json.loads("".join(data)))
    return out


def mock_world():
    respx.get(url__startswith="https://api.open-meteo.com/").mock(return_value=httpx.Response(200, json=om_forecast()))
    respx.get(url__startswith="https://air-quality-api.open-meteo.com/").mock(
        return_value=httpx.Response(
            200,
            json={
                "timezone": "Asia/Dhaka",
                "current": {"time": "2026-04-20T10:00", "pm2_5": 48.0, "pm10": 80.0},
                "hourly": {
                    "time": [f"2026-04-20T{h:02d}:00" for h in range(24)],
                    "pm2_5": [48.0] * 24,
                    "pm10": [80.0] * 24,
                },
            },
        )
    )
    respx.get(url__startswith="https://nominatim.openstreetmap.org/").mock(
        return_value=httpx.Response(200, json=NOMINATIM)
    )


@respx.mock
async def test_why_hot_streams_real_numbers_with_sources_and_actions(client, db):
    mock_world()
    await seed_cells(db)
    await client.post("/api/v1/auth/guest", json={})
    await client.get("/api/v1/zones", params={"lat": DHAKA[0], "lng": DHAKA[1], "radius_m": 500})
    r = await client.post(
        "/api/v1/ask",
        json={
            "message": "আমার এলাকা এত গরম কেন?",
            "screen": "S04",
            "lang": "bn",
            "context": {"lat": DHAKA[0], "lng": DHAKA[1]},
        },
    )
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    ev = events(r.text)
    kinds = [e["type"] for e in ev]
    assert kinds[-1] == "done" and "token" in kinds and "sources" in kinds and "action" in kinds
    assert kinds.index("sources") > kinds.index("token")
    toks = [e["text"] for e in ev if e["type"] == "token"]
    assert toks[0]["code"] in ("ask.answer.why_hot_zone", "ask.answer.why_hot_zone_n")
    assert isinstance(toks[0]["params"]["score"], int) and toks[0]["params"]["lst"] != "–"
    assert toks[1]["code"] == "ask.answer.why_hot_cover"
    assert any(s["id"] == "landsat" for s in next(e for e in ev if e["type"] == "sources")["sources"])
    done = ev[-1]
    assert done["intent"] == "why_hot" and done["remaining_today"] == 4 and done["suggestions"]
    acts = [e["action"] for e in ev if e["type"] == "action"]
    assert acts[0]["screen"] == "S06" and acts[0]["params"]["id"]


@respx.mock
async def test_warnings_come_first(client, db):
    hot = om_forecast()
    hot["daily"]["temperature_2m_max"] = [41] * 10
    respx.get(url__startswith="https://api.open-meteo.com/").mock(return_value=httpx.Response(200, json=hot))
    respx.get(url__startswith="https://nominatim.openstreetmap.org/").mock(
        return_value=httpx.Response(200, json=NOMINATIM)
    )
    await client.post("/api/v1/auth/guest", json={})
    r = await client.post(
        "/api/v1/ask",
        json={"intent": "temp_now", "screen": "S04", "lang": "en", "context": {"lat": DHAKA[0], "lng": DHAKA[1]}},
    )
    ev = events(r.text)
    assert ev[0]["type"] == "warning" and ev[0]["text"]["code"].startswith("warning.heatwave_")
    tok = next(e for e in ev if e["type"] == "token")["text"]
    assert tok["code"] == "ask.answer.temp_now" and tok["params"]["air"] == 33.0


async def test_guest_limit_unknown_storage_and_feedback(client, db):
    await client.post("/api/v1/auth/guest", json={})
    ids = []
    for i in range(5):
        r = await client.post(
            "/api/v1/ask",
            json={"message": f"tell me something interesting about life number {i}", "screen": "S22", "lang": "en"},
        )
        ev = events(r.text)
        assert next(e for e in ev if e["type"] == "token")["text"]["code"] == "ask.answer.unknown"
        ids.append(ev[-1]["message_id"])
    assert (await client.get("/api/v1/ask/usage")).json() == {"limit": 5, "remaining_today": 0}
    sixth = await client.post("/api/v1/ask", json={"intent": "help", "screen": "S04", "lang": "en"})
    assert sixth.status_code == 403 and sixth.json()["code"] == "auth.guest_restricted"
    rows = (await db.execute(select(AskMessage))).scalars().all()
    assert len(rows) == 5 and all(not m.answered and m.unanswered_text for m in rows)
    assert (await client.post(f"/api/v1/ask/{ids[0]}/feedback", json={"helpful": False})).status_code == 204
    await db.refresh(rows[0])
    assert any(m.helpful is False for m in (await db.execute(select(AskMessage))).scalars().all())
    bad = await client.post("/api/v1/ask", json={"intent": "nope", "screen": "S04"})
    assert bad.status_code in (400, 403)


async def test_safety_and_account_intents(client, db):
    await signup(client)
    r = await client.post("/api/v1/ask", json={"message": "How much urea for boro?", "screen": "F01", "lang": "en"})
    tok = [e for e in events(r.text) if e["type"] == "token"]
    assert [t["text"]["code"] for t in tok] == ["ask.answer.safety_chemicals"]
    p = await client.post("/api/v1/ask", json={"intent": "points", "screen": "S20", "lang": "en"})
    first = next(e for e in events(p.text) if e["type"] == "token")["text"]
    assert first["code"] == "ask.answer.points" and first["params"]["earned"] == 0
    t = await client.post("/api/v1/ask", json={"intent": "tree_due", "screen": "S20", "lang": "en"})
    assert next(e for e in events(t.text) if e["type"] == "token")["text"]["code"] == "ask.answer.trees_none"
    s = await client.post("/api/v1/ask", json={"intent": "data_sources", "screen": "S29", "lang": "en"})
    ev = events(s.text)
    assert len([e for e in ev if e["type"] == "token"]) == 3 and any(e["type"] == "sources" for e in ev)
    n = await client.post("/api/v1/ask", json={"intent": "air_now", "screen": "S26", "lang": "en"})
    need = next(e for e in events(n.text) if e["type"] == "token")["text"]
    assert need["code"] == "ask.answer.need_place"  # no place given and no home saved
