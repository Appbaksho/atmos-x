import httpx
import respx
from sqlalchemy import select

from app.models import Job
from tests.conftest import signup
from tests.heatfix import DHAKA, seed_cells

NOMINATIM = {
    "address": {
        "suburb": "Mohammadpur",
        "city": "Dhaka",
        "country": "Bangladesh",
        "country_code": "bd",
        "road": "Asad Avenue",
    },
    "display_name": "x",
}
FORECAST = {
    "timezone": "Asia/Dhaka", "utc_offset_seconds": 21600,
    "current": {"time": "2026-11-07T14:00", "temperature_2m": 31.0, "relative_humidity_2m": 60, "wind_speed_10m": 8, "weather_code": 1, "is_day": 1},
    "daily": {k: [None] for k in ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "precipitation_probability_max", "wind_gusts_10m_max", "wind_speed_10m_max", "et0_fao_evapotranspiration", "weather_code", "relative_humidity_2m_mean"]} | {"time": ["2026-11-07"]},
    "hourly": {"time": [], "temperature_2m": [], "relative_humidity_2m": [], "cape": [], "precipitation_probability": [], "weather_code": []},
}  # fmt: skip


def mock_upstreams():
    respx.get(url__startswith="https://nominatim.openstreetmap.org/").mock(
        return_value=httpx.Response(200, json=NOMINATIM)
    )
    respx.get(url__startswith="https://api.open-meteo.com/").mock(return_value=httpx.Response(200, json=FORECAST))


@respx.mock
async def test_e2_list_and_detail_are_identical(client, db):
    mock_upstreams()
    await seed_cells(db)
    r = await client.get("/api/v1/zones", params={"lat": DHAKA[0], "lng": DHAKA[1], "radius_m": 500, "lang": "en"})
    assert r.status_code == 200, r.text
    scan = r.json()
    assert scan["scan"]["status"] == "complete" and scan["scan"]["k"] == 4 and scan["scan"]["cell_count"] == 61
    assert scan["scan"]["acquired"]["lst_to"] == "2026-11-02"
    assert any(s["id"] == "landsat" for s in scan["meta"]["sources"])
    assert len(scan["zones"]) >= 1
    for z in scan["zones"]:
        d = (await client.get(f"/api/v1/zones/{z['id']}", params={"lang": "en"})).json()
        for f in ("id", "name", "score", "dist_m", "h3", "lst_c", "rank", "centroid"):
            assert d[f] == z[f], f
        assert d["air_c"] == 31.0 and d["what_if_green"]["lst_drop_c"] >= 0
    # same request again → same scan id and zone ids (shared scan)
    again = (await client.get("/api/v1/zones", params={"lat": DHAKA[0], "lng": DHAKA[1], "radius_m": 500})).json()
    assert again["scan"]["id"] == scan["scan"]["id"] and [z["id"] for z in again["zones"]] == [
        z["id"] for z in scan["zones"]
    ]
    assert scan["my_zone_id"] in {z["id"] for z in scan["zones"]}


@respx.mock
async def test_hot_zone_ranks_first_and_drivers(client, db):
    mock_upstreams()
    await seed_cells(db)
    scan = (await client.get("/api/v1/zones", params={"lat": DHAKA[0], "lng": DHAKA[1], "radius_m": 500})).json()
    top = scan["zones"][0]
    assert top["rank"] == 1 and top["score"] >= scan["zones"][-1]["score"]
    dr = top["drivers"]
    assert dr["sealed_pct"] == 95 and dr["green_pct"] == 2
    assert {c["driver"] for c in dr["contributions"]} == {"sealed", "green", "water", "dark_surface"}
    assert "contributions" in dr["estimated"]  # fewer than 500 hexes: V0 coefficients, labelled estimate


async def test_unknown_zone_is_404(client):
    r = await client.get("/api/v1/zones/z_deadbeef_1")
    assert r.status_code == 404 and r.json()["code"] == "zone.not_found"


@respx.mock
async def test_cold_area_returns_partial_and_queues_one_job(client, db):
    mock_upstreams()
    r = await client.get("/api/v1/zones", params={"lat": 24.0, "lng": 90.0, "radius_m": 200})
    body = r.json()
    assert r.status_code == 200 and body["scan"]["status"] == "partial" and body["scan"]["job_id"]
    assert all(h["label"] == "no_data" for h in body["hexes"]) and len(body["hexes"]) == 19
    assert body["zones"] == []
    r2 = await client.get("/api/v1/zones", params={"lat": 24.0, "lng": 90.0, "radius_m": 200})
    assert r2.json()["scan"]["job_id"] == body["scan"]["job_id"]  # deduplicated
    jobs = (await db.execute(select(Job).where(Job.kind == "heat_chunk"))).scalars().all()
    assert len(jobs) == 1
    j = (await client.get(f"/api/v1/scan-jobs/{body['scan']['job_id']}")).json()
    assert j["status"] == "queued"


@respx.mock
async def test_guest_radius_cap(client):
    mock_upstreams()
    await client.post("/api/v1/auth/guest", json={})
    r = await client.get("/api/v1/zones", params={"lat": DHAKA[0], "lng": DHAKA[1], "radius_m": 1000})
    assert r.status_code == 403 and r.json()["code"] == "auth.guest_restricted"
    await signup(client, email="u@example.org")
    r = await client.get("/api/v1/zones", params={"lat": DHAKA[0], "lng": DHAKA[1], "radius_m": 1000})
    assert r.status_code == 200 and r.json()["scan"]["cell_count"] == 217


async def test_job_progress_updates(db):
    """Regression: the progress UPDATE once used `:d::float`, which SQLAlchemy can't bind, so every
    region precompute failed on its first progress report."""
    from app.services import jobs as q

    await q.enqueue(db, "heat_region", "progress-test", {})
    await db.commit()
    job = (await db.execute(select(Job).where(Job.key == "progress-test"))).scalar_one()
    await q.progress(db, job.id, 3, 4)
    await db.refresh(job)
    assert (job.done_cells, job.total_cells, job.progress) == (3, 4, 0.75)
    await q.progress(db, job.id, 0, 0)
    await db.refresh(job)
    assert job.progress == 0
