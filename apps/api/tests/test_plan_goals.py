from datetime import UTC, date, datetime, timedelta

import httpx
import respx
from sqlalchemy import select

from app.models import Job, PlantingSpots
from tests.conftest import signup
from tests.heatfix import DHAKA, seed_cells
from tests.test_zones import mock_upstreams


async def _zone(client, db, spots: dict | None = None) -> dict:
    await seed_cells(db)
    z = (await client.get("/api/v1/zones", params={"lat": DHAKA[0], "lng": DHAKA[1], "radius_m": 500})).json()["zones"][
        0
    ]
    if spots is not None:
        db.add(
            PlantingSpots(
                zone_id=z["id"],
                status="ready",
                features=[],
                totals=spots,
                zone_area_m2=z["area_km2"] * 1e6,
                expires_at=datetime.now(UTC) + timedelta(days=7),
            )
        )
        await db.commit()
    return z


def _in(months: int) -> str:
    return (date.today() + timedelta(days=round(months * 30.44))).isoformat()


@respx.mock
async def test_preview_feasibility_uses_space_and_timeline(client, db, seeded):
    mock_upstreams()
    z = await _zone(client, db, {"ground_m2": 0, "roof_m2": 2000, "roadside_m": 0})
    r = await client.get(
        "/api/v1/plan/preview", params={"zone_id": z["id"], "target_c": -2.0, "by_date": _in(12), "lang": "en"}
    )
    assert r.status_code == 200, r.text
    p = r.json()
    f = p["feasibility"]
    assert f["kind"] == "action" and f["feasible"] == "no"  # E9: no open ground, one year
    assert p["budget"]["total"]["currency"] == "BDT" and p["budget"]["lines"]
    assert p["steps"][0]["title"]["code"] == "plan.step.map.title"
    assert p["species"][0]["id"] in {
        "bot",
        "rain",
        "peepal",
        "krish",
        "arjun",
        "radha",
        "kadam",
    }  # wide canopy first on a sealed block
    assert all(a["estimate"] for a in p["actions"] if a["action_type"] != "awareness")


@respx.mock
async def test_preview_without_spots_queues_job(client, db, seeded):
    mock_upstreams()
    z = await _zone(client, db)
    p = (
        await client.get("/api/v1/plan/preview", params={"zone_id": z["id"], "target_c": -1.0, "by_date": _in(60)})
    ).json()
    assert p["feasibility"]["spots_status"] == "pending" and p["feasibility"]["kind"] == "cooling"
    assert (await db.execute(select(Job).where(Job.kind == "planting_spots"))).scalars().first() is not None


@respx.mock
async def test_guest_drafts_then_upgrades_and_creates_goal(client, db, seeded):
    mock_upstreams()
    await client.post("/api/v1/auth/guest", json={})
    z = await _zone(client, db, {"ground_m2": 5000, "roof_m2": 8000, "roadside_m": 400})
    body = {"zone_id": z["id"], "target_c": -0.5, "by_date": _in(24)}
    r = await client.post("/api/v1/goals", json=body)
    assert r.status_code == 403 and r.json()["code"] == "auth.guest_restricted"
    assert (await client.post("/api/v1/goal-drafts", json={"payload": body})).status_code == 200
    await client.post(
        "/api/v1/auth/upgrade", json={"email": "g2@example.org", "password": "long enough", "display_name": "G"}
    )
    draft = (await client.get("/api/v1/goal-drafts")).json()
    assert draft["payload"]["zone_id"] == z["id"]  # kept through sign-up (G5)
    g = (await client.post("/api/v1/goals", json=draft["payload"])).json()
    assert (
        g["zone_id"] == z["id"]
        and g["zone_name"] == (z["name"] or f"Zone {z['rank']}")
        and g["kind"] == "action"
        and g["progress_pct"] == 0
    )
    assert g["zone_centroid"] == z["centroid"]
    tasks = (await client.get(f"/api/v1/goals/{g['id']}/tasks")).json()
    assert len(tasks) >= 4 and tasks[0]["due"] and any(t["action_type"] == "plant_tree" for t in tasks)
    mine = (await client.get("/api/v1/goals/mine")).json()
    assert [x["id"] for x in mine] == [g["id"]]
    plan = (await client.get(f"/api/v1/goals/{g['id']}/plan")).json()
    assert plan["goal_id"] == g["id"]
    budget = (await client.get("/api/v1/budget", params={"goal_id": g["id"]})).json()
    assert budget["total"]["amount"] > 0


@respx.mock
async def test_goal_privacy_and_idempotent_client_id(client, client2, db, seeded):
    mock_upstreams()
    await signup(client, email="a@example.org")
    z = await _zone(client, db, {"ground_m2": 5000, "roof_m2": 8000, "roadside_m": 400})
    body = {"zone_id": z["id"], "target_c": -1.0, "by_date": _in(36), "client_id": "c-1"}
    g1 = (await client.post("/api/v1/goals", json=body)).json()
    g2 = (await client.post("/api/v1/goals", json=body)).json()
    assert g1["id"] == g2["id"]
    await signup(client2, email="b@example.org")
    assert (await client2.get(f"/api/v1/goals/{g1['id']}")).status_code == 404
    assert (await client2.patch(f"/api/v1/goals/{g1['id']}", json={"status": "done"})).status_code == 404
    bad = await client.post("/api/v1/goals", json={**body, "client_id": None, "by_date": "2020-01-01"})
    assert bad.status_code == 400 and bad.json()["code"] == "goal.date_past"


async def test_species_and_action_types(client, seeded):
    bd = (await client.get("/api/v1/species", params={"lat": 23.76, "lng": 90.36, "lang": "bn"})).json()
    assert bd["region"] == "BD" and len(bd["species"]) == 21 and bd["species"][0]["price"]["currency"] == "BDT"
    assert any(s["name"] == "নিম" for s in bd["species"])
    eu = (await client.get("/api/v1/species", params={"lat": 51.5, "lng": -0.12})).json()
    assert eu["species"] and all(s["price"] is None and s["commonly_planted"] for s in eu["species"])
    one = (await client.get("/api/v1/species/neem")).json()
    assert one["notes"][0]["code"].startswith("species.care.") and one["water"] == "low"
    at = (await client.get("/api/v1/action-types")).json()
    roof = next(a for a in at if a["id"] == "cool_roof")
    assert roof["points"] == 30 and roof["points_per"] == 10  # PT5: 30 per 100 m²


@respx.mock
async def test_nurseries_from_osm_job(client, db):
    from app.services import nurseries

    respx.post(url__regex=r".*overpass.*").mock(
        return_value=httpx.Response(
            200,
            json={
                "elements": [
                    {
                        "type": "node",
                        "id": 1,
                        "lat": 23.761,
                        "lon": 90.36,
                        "tags": {"shop": "garden_centre", "name": "Green Nursery"},
                    },
                    {
                        "type": "node",
                        "id": 2,
                        "lat": 23.762,
                        "lon": 90.36,
                        "tags": {"shop": "florist", "name": "Rose Flowers"},
                    },
                ]
            },
        )
    )
    r = (await client.get("/api/v1/nurseries", params={"lat": 23.759, "lng": 90.359})).json()
    assert r["status"] == "pending" and r["nurseries"] == []
    await nurseries.refresh(db, 23.759, 90.359, 5000)
    r = (await client.get("/api/v1/nurseries", params={"lat": 23.759, "lng": 90.359})).json()
    assert [n["name"] for n in r["nurseries"]] == ["Green Nursery"] and r["nurseries"][0]["dist_m"] < 400
