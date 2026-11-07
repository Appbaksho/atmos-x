"""Farmer alerts (§7.9): the 10 rules, cold bands, SMAP/POWER drought, lightning weighting, fields API."""

from datetime import date, timedelta

import httpx
import respx

from app.engines import farmer as F
from tests.conftest import signup

D0 = date(2026, 4, 20)
DHAKA = (23.78, 90.41)
SUNAMGANJ = (24.9, 91.4)  # haor
KHULNA_COAST = (22.5, 89.5)


def days(n=7, **over) -> list[dict]:
    out = []
    for i in range(n):
        d = {
            "date": (D0 + timedelta(days=i)).isoformat(),
            "tmax": 31.0,
            "tmin": 22.0,
            "rain": 2.0,
            "gust": 20.0,
            "wind": 10.0,
            "et0": 4.0,
            "code": 1,
        }
        for k, v in over.items():
            d[k] = v[i] if isinstance(v, list) else v
        out.append(d)
    return out


def hours(n_days=7, **over) -> list[dict]:
    out = []
    for i in range(n_days):
        for h in range(24):
            row = {
                "time": f"{(D0 + timedelta(days=i)).isoformat()}T{h:02d}:00",
                "temp": 28.0,
                "rh": 70.0,
                "cape": 500.0,
                "precip_prob": 20.0,
                "code": 1,
            }
            row.update(over)
            out.append(row)
    return out


def run(daily=None, hourly=None, crop="boro", stage="vegetative", lat=DHAKA[0], lng=DHAKA[1], month=4, **kw):
    return F.rules(
        F.Inputs(
            daily=daily or days(), hourly=hourly or hours(), lat=lat, lng=lng, crop=crop, stage=stage, month=month, **kw
        )
    )


def rules_of(alerts):
    return {a["rule"]: a for a in alerts}


def test_quiet_week_has_no_alerts():
    assert run() == []


def test_rice_heat_at_flowering_and_worker_heat():
    a = rules_of(run(days(tmax=[33, 36, 39, 33, 33, 33, 33]), stage="flowering"))
    assert a["rice_heat"]["level"] == "danger" and a["rice_heat"]["body"]["params"]["days"] == 2
    assert a["rice_heat"]["body"]["params"]["day"] == "2026-04-21"
    assert "worker_heat" in a  # 39 °C at 70 % RH → heat index well above 41
    assert rules_of(run(days(tmax=36.5), stage="vegetative"))["rice_heat"]["level"] == "watch"
    assert "rice_heat" not in rules_of(run(days(tmax=36.5), crop="potato"))


def test_cold_wave_uses_four_bmd_bands():
    for tmin, band, level in [
        (9.5, "mild", "watch"),
        (7.0, "moderate", "warning"),
        (5.0, "severe", "danger"),
        (3.5, "very_severe", "danger"),
    ]:
        a = rules_of(run(days(tmin=[22, tmin, 22, 22, 22, 22, 22]), month=1))["cold"]
        assert a["title"]["code"] == f"farm.cold.title_{band}" and a["level"] == level
        assert a["sources"] == ["bmd_thresholds"]


def test_drought_prefers_smap_then_power():
    dry = days(rain=0.0, et0=5.0)
    smap = rules_of(run(dry, smap_rootzone=0.15, rain30_mm=80))["drought"]
    assert (
        smap["level"] == "warning" and smap["body"]["code"] == "farm.drought.body_smap" and smap["sources"] == ["smap"]
    )
    assert "drought" not in rules_of(run(dry, smap_rootzone=0.45, rain30_mm=2))  # SMAP says moist: it wins
    power = rules_of(run(dry, rain30_mm=8))["drought"]
    assert power["level"] == "warning" and power["sources"] == ["power"] and power["body"]["params"]["et7"] == 35
    assert rules_of(run(dry, rain30_mm=20))["drought"]["level"] == "watch"
    assert "drought" not in rules_of(run(dry, rain30_mm=8, crop="potato"))
    assert "drought" not in rules_of(run(dry))  # no NASA context → no drought claim


def test_storm_coastal_harvest_is_danger():
    a = rules_of(
        run(days(gust=[20, 70, 20, 20, 20, 20, 20]), lat=KHULNA_COAST[0], lng=KHULNA_COAST[1], stage="harvest")
    )["storm"]
    assert (
        a["level"] == "danger"
        and a["title"]["code"] == "farm.storm.title_coastal"
        and a["actions"][0]["code"] == "farm.storm.a1_harvest"
    )
    assert rules_of(run(days(gust=[20, 70, 20, 20, 20, 20, 20])))["storm"]["level"] == "warning"


def test_haor_flash_flood_local_upstream_and_imerg():
    lat, lng = SUNAMGANJ
    wet = days(rain=[40, 40, 40, 0, 0, 0, 0])
    a = rules_of(run(wet, lat=lat, lng=lng))["haor_flood"]
    assert a["level"] == "warning" and a["body"]["params"]["local_mm"] == 120
    up = rules_of(run(days(), lat=lat, lng=lng, upstream_daily=days(rain=[100, 100, 60, 0, 0, 0, 0])))["haor_flood"]
    assert up["level"] == "danger" and "open_meteo_upstream" in up["sources"]
    obs = rules_of(run(days(), lat=lat, lng=lng, imerg_72h_mm=130.0))["haor_flood"]
    assert "imerg" in obs["sources"]
    assert "haor_flood" not in rules_of(run(wet, lat=lat, lng=lng, month=9))  # outside Mar–Jun


def test_late_blight_needs_two_humid_cool_days_in_a_row():
    h = hours(rh=95.0, temp=18.0)
    assert rules_of(run(hourly=h, crop="potato", month=1))["late_blight"]["level"] == "warning"
    assert "late_blight" not in rules_of(run(hourly=h, crop="boro", month=1))


def test_monsoon_onset_info():
    a = rules_of(run(days(rain=[12, 15, 20, 5, 0, 0, 0]), month=6))
    assert a["monsoon"]["level"] == "info" and a["monsoon"]["from"] == "2026-04-22"


def test_lightning_is_weighted_by_climatology():
    h = hours(cape=1500.0, precip_prob=60.0)
    assert "lightning" not in rules_of(run(hourly=h))
    w = rules_of(run(hourly=h, lightning_weight=1.5, lightning_rate=0.15))["lightning"]
    assert w["level"] == "warning" and w["sources"] == ["lisotd"] and w["body"]["params"]["cape"] == 1500
    codes = rules_of(run(days(code=[95, 1, 1, 1, 1, 1, 1])))["lightning"]
    assert codes["body"]["code"] == "farm.lightning.body_codes"


def test_heavy_rain_bmd_classes_and_imerg():
    a = rules_of(run(days(rain=[2, 50, 2, 2, 2, 2, 2])))["heavy_rain"]
    assert a["level"] == "warning" and a["title"]["code"] == "farm.heavy_rain.title_heavy"
    v = rules_of(run(days(rain=[2, 95, 2, 2, 2, 2, 2])))["heavy_rain"]
    assert v["level"] == "danger" and v["title"]["code"] == "farm.heavy_rain.title_very_heavy"
    o = rules_of(run(imerg_max_day_mm=60.0, imerg_72h_mm=70.0))["heavy_rain"]
    assert o["body"]["code"] == "farm.heavy_rain.body_observed" and "imerg" in o["sources"]
    assert "heavy_rain" not in rules_of(run(days(rain=[2, 30, 2, 2, 2, 2, 2])))  # moderately heavy only


def test_alerts_are_sorted_by_level():
    a = run(
        days(tmax=[39, 39, 33, 33, 33, 33, 33], rain=[2, 50, 2, 2, 2, 2, 2], tmin=[22, 22, 9, 22, 22, 22, 22]),
        stage="flowering",
    )
    levels = [x["level"] for x in a]
    assert levels == sorted(levels, key=lambda lv: F.LEVEL_ORDER[lv])


# ── API ─────────────────────────────────────────────────────────────────────


def om_forecast(today="2026-04-20") -> dict:
    ds = [(date.fromisoformat(today) + timedelta(days=i - 3)).isoformat() for i in range(10)]
    hs = [f"{d}T{h:02d}:00" for d in ds for h in range(24)]
    return {
        "timezone": "Asia/Dhaka",
        "utc_offset_seconds": 21600,
        "current": {
            "time": f"{today}T10:00",
            "temperature_2m": 33.0,
            "relative_humidity_2m": 60,
            "wind_speed_10m": 8,
            "weather_code": 1,
            "is_day": 1,
        },
        "daily": {
            "time": ds,
            "temperature_2m_max": [33, 33, 33, 33, 39, 39, 33, 33, 33, 33],
            "temperature_2m_min": [24] * 10,
            "precipitation_sum": [0, 0, 0, 1, 1, 60, 1, 1, 1, 1],
            "precipitation_probability_max": [10] * 10,
            "wind_gusts_10m_max": [20] * 10,
            "wind_speed_10m_max": [10] * 10,
            "et0_fao_evapotranspiration": [4] * 10,
            "weather_code": [1] * 10,
            "relative_humidity_2m_mean": [60] * 10,
        },
        "hourly": {
            "time": hs,
            "temperature_2m": [30] * len(hs),
            "relative_humidity_2m": [60] * len(hs),
            "cape": [300] * len(hs),
            "precipitation_probability": [10] * len(hs),
            "weather_code": [1] * len(hs),
        },
    }


@respx.mock
async def test_guest_alerts_by_place_and_fields_need_an_account(client):
    respx.get(url__startswith="https://api.open-meteo.com/").mock(return_value=httpx.Response(200, json=om_forecast()))
    await client.post("/api/v1/auth/guest", json={})
    r = await client.get(
        "/api/v1/farm/alerts", params={"lat": DHAKA[0], "lng": DHAKA[1], "crop": "boro", "stage": "flowering"}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    rules = {a["rule"] for a in body["alerts"]}
    assert {"rice_heat", "heavy_rain"} <= rules
    heat = next(a for a in body["alerts"] if a["rule"] == "rice_heat")
    assert heat["level"] == "danger" and heat["window"] == {"from": "2026-04-21", "to": "2026-04-22"}
    assert [s["id"] for s in heat["sources"]] == ["open_meteo"]  # only what was used
    assert heat["id"] == "rice_heat-2026-04-21@23.8,90.4" and heat["done"] is False
    assert (await client.get("/api/v1/farm/fields")).json() == []
    add = await client.post(
        "/api/v1/farm/fields",
        json={"name": "North", "crop": "boro", "stage": "flowering", "location": {"lat": 23.8, "lng": 90.4}},
    )
    assert add.status_code == 403 and add.json()["code"] == "auth.guest_restricted"
    bad = await client.get(
        "/api/v1/farm/alerts", params={"lat": 23.8, "lng": 90.4, "crop": "rubber", "stage": "flowering"}
    )
    assert bad.status_code == 400 and bad.json()["code"] == "farm.crop"


@respx.mock
async def test_fields_alerts_done_and_worker_notifies_once(client, db):
    from app.jobs import farm as farm_job
    from app.models import Notification

    respx.get(url__startswith="https://api.open-meteo.com/").mock(return_value=httpx.Response(200, json=om_forecast()))
    await signup(client)
    f = (
        await client.post(
            "/api/v1/farm/fields",
            json={
                "name": "North plot",
                "crop": "boro",
                "stage": "flowering",
                "location": {"lat": 23.8, "lng": 90.4},
                "area": 1.5,
            },
        )
    ).json()
    assert f["crop"] == "boro" and f["location"] == {"lat": 23.8, "lng": 90.4}
    p = await client.patch(f"/api/v1/farm/fields/{f['id']}", json={"stage": "ripening"})
    assert p.json()["stage"] == "ripening"
    await client.patch(f"/api/v1/farm/fields/{f['id']}", json={"stage": "flowering"})
    al = (await client.get("/api/v1/farm/alerts", params={"field_id": f["id"]})).json()
    heat = next(a for a in al["alerts"] if a["rule"] == "rice_heat")
    one = await client.get(f"/api/v1/farm/alerts/{heat['id']}", params={"field_id": f["id"]})
    assert one.status_code == 200 and one.json()["rule"] == "rice_heat"
    assert (await client.post(f"/api/v1/farm/alerts/{heat['id']}/done", json={"field_id": f["id"]})).status_code == 204
    again = (await client.get("/api/v1/farm/alerts", params={"field_id": f["id"]})).json()
    assert next(a for a in again["alerts"] if a["rule"] == "rice_heat")["done"] is True
    gone = await client.get("/api/v1/farm/alerts/storm-2026-04-20@23.8,90.4", params={"field_id": f["id"]})
    assert gone.status_code == 404 and gone.json()["code"] == "farm.alert_gone"
    r1 = await farm_job.farm_alerts(db, None)
    r2 = await farm_job.farm_alerts(db, None)
    assert r1["notified"] >= 2 and r1["notified"] == r2["notified"]
    from sqlalchemy import select

    n = (await db.execute(select(Notification).where(Notification.kind == "farm_alert"))).scalars().all()
    assert len(n) == r1["notified"]  # deduplicated per field and alert
    assert n[0].body["params"]["field"] == "North plot"
    assert (await client.delete(f"/api/v1/farm/fields/{f['id']}")).status_code == 204
    assert (await client.get("/api/v1/farm/fields")).json() == []
