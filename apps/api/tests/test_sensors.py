from tests.conftest import signup


async def test_sensor_token_once_and_ingest(client):
    await client.post("/api/v1/auth/guest", json={})
    r = await client.post("/api/v1/sensors", json={"name": "Balcony"})
    assert r.status_code == 403 and r.json()["code"] == "auth.guest_restricted"
    await signup(client)
    r = await client.post("/api/v1/sensors", json={"name": "Balcony", "lat": 23.76, "lng": 90.36})
    assert r.status_code == 200
    tok = r.json()["token"]
    assert tok.startswith("atx_") and "token" not in (await client.get("/api/v1/sensors/mine")).json()[0]
    bad = await client.post("/api/v1/sensors/ingest", json={"pm25": 42.0}, headers={"X-Sensor-Token": "nope"})
    assert bad.status_code == 401
    ok = await client.post("/api/v1/sensors/ingest", json={"pm25": 42.0}, headers={"X-Sensor-Token": tok})
    assert ok.status_code == 200
    again = await client.post("/api/v1/sensors/ingest", json={"pm25": 43.0}, headers={"X-Sensor-Token": tok})
    assert again.status_code == 429  # one reading per minute
    out_of_range = await client.post("/api/v1/sensors/ingest", json={"pm25": 5000}, headers={"X-Sensor-Token": tok})
    assert out_of_range.status_code == 422
    mine = (await client.get("/api/v1/sensors/mine")).json()
    assert mine[0]["pm25"] == 42.0 and mine[0]["online"] is True
