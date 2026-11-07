"""Provider parsing and grid maths, with recorded or synthetic replies (no network)."""

from datetime import UTC, datetime

import httpx
import pytest
import respx

from app.providers import earthdata as ed
from app.providers import geos, nominatim, open_meteo, openaq, power
from app.services import conditions as C
from app.services.gibs import parse_default_date

CF_REPLY = """pm25_rh35, [3][1][1][1]
[0][0][0], 49.5


[1][0][0], 1.0E15


[2][0][0], 59.6875


time, [3]
739927.3958333334, 739927.4375, 739927.4791666666
lev, [1]
72.0
"""


def test_geos_ascii_fill_and_time():
    vals, times = geos.parse_ascii(CF_REPLY, "pm25_rh35")
    assert vals == [49.5, None, 59.6875]  # 1.0E15 is fill, never a number
    assert times[0] == datetime(2026, 11, 6, 9, 30, tzinfo=UTC)
    with pytest.raises(ValueError):
        geos.parse_ascii("Error: variable not found", "t2m")


def test_geos_indices_lat_lng_order():
    assert geos.fp_index(23.759, 90.359) == (455, 865)
    assert geos.cf_index(23.759, 90.359) == (455, 1081)
    assert geos.run_time("20261106_09z") == datetime(2026, 11, 6, 9, tzinfo=UTC)


def test_power_cells():
    assert power.half_degree(23.759, 90.359) == (24.0, 90.5)


def test_imerg_and_ease2_indices():
    lo, la = ed.imerg_index(23.759, 90.359)
    assert (lo, la) == (2703, 1137)  # [time][lon][lat] order
    row, col = ed.ease2_m09_index(23.759, 90.359)
    assert (row, col) == (484, 2895)  # matches the cell SMAP returned live for Dhaka


def test_jwt_exp():
    import base64
    import json

    tok = "x." + base64.urlsafe_b64encode(json.dumps({"exp": 1800000000}).encode()).decode().rstrip("=") + ".y"
    assert ed._jwt_exp(tok) == 1800000000


def test_nominatim_parse():
    r = nominatim.parse(
        {
            "address": {
                "suburb": "Mohammadpur",
                "city": "Dhaka Metropolitan",
                "country": "Bangladesh",
                "country_code": "bd",
                "road": "Asad Avenue",
            }
        }
    )
    assert r == {
        "place": "Mohammadpur, Dhaka",
        "city": "Dhaka",
        "country": "Bangladesh",
        "country_code": "BD",
        "near": "Asad Avenue",
    }


def test_open_meteo_parse_keeps_nulls():
    j = {
        "timezone": "Asia/Dhaka",
        "utc_offset_seconds": 21600,
        "current": {
            "time": "2026-11-07T14:00",
            "temperature_2m": 31.0,
            "relative_humidity_2m": None,
            "wind_speed_10m": 8,
            "weather_code": 1,
            "is_day": 1,
        },
        "daily": {
            "time": ["2026-11-07"],
            **{
                k: [None]
                for k in [
                    "temperature_2m_max",
                    "temperature_2m_min",
                    "precipitation_sum",
                    "precipitation_probability_max",
                    "wind_gusts_10m_max",
                    "wind_speed_10m_max",
                    "et0_fao_evapotranspiration",
                    "weather_code",
                ]
            },
        },
        "hourly": {
            "time": [],
            "temperature_2m": [],
            "relative_humidity_2m": [],
            "cape": [],
            "precipitation_probability": [],
            "weather_code": [],
        },
    }
    fc = open_meteo.parse_forecast(j)
    assert fc["current"]["rh"] is None and fc["daily"][0]["tmax"] is None  # missing stays null


def test_gibs_default_date():
    xml = "<Layer><ows:Identifier>Other</ows:Identifier><Default>2001-01-01</Default></Layer><Layer><ows:Identifier>MODIS_Terra_Land_Surface_Temp_Day</ows:Identifier><Dimension><Default>2026-11-08</Default></Dimension></Layer>"
    assert parse_default_date(xml) == "2026-11-08"


@respx.mock
async def test_openaq_lat_lng_order_and_pm25_only(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "openaq_api_key", "k")
    route = respx.get("https://api.openaq.org/v3/locations").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": 1,
                        "name": "Dhanmondi",
                        "coordinates": {"latitude": 23.746, "longitude": 90.374},
                        "sensors": [{"id": 11, "parameter": {"id": 2, "name": "pm25"}}],
                    },
                    {
                        "id": 2,
                        "name": "No PM",
                        "coordinates": {"latitude": 23.7, "longitude": 90.4},
                        "sensors": [{"id": 12, "parameter": {"id": 1, "name": "pm10"}}],
                    },
                ]
            },
        )
    )
    locs = await openaq.locations(23.759, 90.359)
    assert route.calls[0].request.url.params["coordinates"] == "23.7590,90.3590"
    assert [x["id"] for x in locs] == [1]


def test_merge_forecast_sanity_rule():
    om = [{"date": "2026-11-04", "tmax": 30.5, "tmin": 24.4, "rain": 0.0}]
    fc = {"hourly": [{"time": "2026-11-04T13:00", "rh": 55.0}], "daily": om}
    geos_days = {"2026-11-04": {"tmax": 32.0, "tmin": 20.3, "n": 24}}
    d = C.merge_forecast(om, geos_days, True, fc, "2026-11-04")[0]
    # §7.7 worked example: keep GEOS-FP Tmax (32.0 vs 30.5), take Open-Meteo Tmin (24.4 vs 20.3)
    assert (
        d["tmax_c"] == 32.0
        and d["tmin_c"] == 24.4
        and d["disagreement"] is True
        and d["source"] == "geos_fp+open_meteo"
    )
    assert C.merge_forecast(om, None, True, fc, "2026-11-04")[0]["source"] == "open_meteo"


def test_warnings_bmd_and_noaa():
    days = [
        {
            "date": "2026-04-15",
            "tmax_c": 40.2,
            "tmin_c": 27,
            "feels_max_c": 47,
            "bmd_level": "severe",
            "cold_level": None,
            "heat_risk": "danger",
        }
    ]
    w = C.warnings_for(days, True)
    assert w[0]["source"] == "local" and w[0]["text"]["code"] == "warning.heatwave_severe"
    w2 = C.warnings_for([{**days[0], "bmd_level": None, "heat_risk": "xdanger", "feels_max_c": 55}], False)
    assert w2[0]["text"]["code"] == "warning.heat_extreme"
