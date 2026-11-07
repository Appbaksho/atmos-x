"""Engines: conversions, fills, Heat Score, zones, drivers, weather (no network, no DB writes)."""

from datetime import UTC, date, datetime

import h3
import numpy as np
import pytest

from app.engines import drivers as D
from app.engines import heat as H
from app.engines import raster as R
from app.engines import weather as W


def test_landsat_st_conversion_and_fill():
    dn = np.array([0, 43636, 50000], dtype=np.uint16)
    c = R.landsat_st_to_c(dn)
    assert np.isnan(c[0])  # DN 0 is nodata, never a number
    assert c[1] == pytest.approx(43636 * 0.00341802 + 149.0 - 273.15, abs=1e-3)
    assert c[1] == pytest.approx(25.0, abs=0.1)


def test_landsat_qa_bits():
    qa = np.array([0b0, 1 << 3, 1 << 4, 1 << 7, (1 << 7) | (1 << 2), 1 << 0], dtype=np.uint16)
    assert R.landsat_clear(qa).tolist() == [True, False, False, True, False, False]


def test_landsat_reflectance_and_albedo():
    sr = R.landsat_sr(np.array([0, 10000], dtype=np.uint16))
    assert np.isnan(sr[0]) and sr[1] == pytest.approx(10000 * 0.0000275 - 0.2)
    a = R.albedo_liang(np.float32(0.1), np.float32(0.1), np.float32(0.1), np.float32(0.1), np.float32(0.1))
    assert a == pytest.approx(0.1 * (0.356 + 0.130 + 0.373 + 0.085 + 0.072) - 0.0018, abs=1e-6)


def test_modis_scale_and_fill():
    c = R.modis_lst_to_c(np.array([0, 15000], dtype=np.uint16))
    assert np.isnan(c[0]) and c[1] == pytest.approx(15000 * 0.02 - 273.15)


def test_hls_and_ndvi():
    refl = R.hls_reflectance(np.array([-9999, 2000], dtype=np.int16))
    assert np.isnan(refl[0]) and refl[1] == pytest.approx(0.2)
    assert R.hls_clear(np.array([0, 2, 4, 8, 16, 32, 255], dtype=np.uint8)).tolist() == [
        True,
        False,
        False,
        False,
        False,
        True,
        False,
    ]
    v = R.ndvi(np.array([0.1, 0.0], dtype=np.float32), np.array([0.5, 0.0], dtype=np.float32))
    assert v[0] == pytest.approx(0.4 / 0.6, abs=1e-5) and np.isnan(v[1])


def test_kelvin_roundtrip():
    assert R.k_to_c(273.15) == 0 and R.c_to_k(R.k_to_c(300.0)) == pytest.approx(300.0)


def test_nan_median_stack_counts():
    a = np.array([[1.0, np.nan]], dtype=np.float32)
    b = np.array([[3.0, np.nan]], dtype=np.float32)
    med, cnt = R.nan_median_stack([a, b])
    assert med[0, 0] == 2.0 and np.isnan(med[0, 1]) and cnt.tolist() == [[2, 0]]


def test_class_fractions_30m():
    wc = np.array([[50, 50, 10], [50, 80, 10], [0, 50, 10]], dtype=np.uint8)
    built = R.class_fractions_30m(wc, (R.WC_BUILT,))
    assert built.shape == (1, 1) and built[0, 0] == pytest.approx(4 / 8)  # the 0 pixel does not count


def test_aggregate_and_median_by_cell():
    codes = np.array([0, 0, 1, -1, 1])
    vals = np.array([1.0, 3.0, np.nan, 100.0, 5.0])
    mean, cnt = R.aggregate_by_cell(codes, vals, 3)
    assert mean[0] == 2.0 and mean[1] == 5.0 and np.isnan(mean[2]) and cnt.tolist() == [2, 1, 0]
    assert R.median_by_cell(codes, vals, 3)[0] == 2.0


def test_k_for_radius_and_counts():
    assert [H.k_for_radius(r) for r in (200, 500, 1000)] == [2, 4, 8]
    assert [H.ring_count(k) for k in (2, 4, 8)] == [19, 61, 217]
    c = h3.latlng_to_cell(23.759, 90.359, 10)
    assert len(h3.grid_disk(c, 2)) == 19


def test_heat_score_formula_and_renormalization():
    full = H.heat_score(6.0, 3.0, 1.0, 0.0, 40_000)
    assert full.score == 100 and full.terms == ["day", "night", "not_green", "pop", "sealed"]
    cool = H.heat_score(-6.0, -3.0, 0.0, 1.0, 0)
    assert cool.score == 0
    # night and population missing: dropped and the rest re-normalized
    r = H.heat_score(0.0, None, 0.5, 0.5, None)
    expected = (0.55 * 0.5 + 0.15 * 0.5 + 0.10 * 0.5) / (0.55 + 0.15 + 0.10)
    assert r.score == round(100 * expected) and "night" not in r.terms
    assert H.heat_score(None, None, None, None) is None


def test_heat_score_calibration_shape():
    """Built-up, treeless blocks a bit above the city median score high; tree and water hexes low."""
    built = H.heat_score(1.2, None, 0.95, 0.03).score
    trees = H.heat_score(-1.8, None, 0.2, 0.7).score
    water = H.heat_score(-3.4, None, 0.05, 0.1).score
    assert 65 <= built <= 85
    assert trees < 45 and water < 45


def _ring_cells(center, k):
    return h3.grid_disk(center, k)


def test_cluster_hot_cells_connected_and_flat():
    center = h3.latlng_to_cell(23.759, 90.359, 10)
    ring = _ring_cells(center, 2)
    hot = set(h3.grid_disk(center, 1))
    cells = [
        H.Cell(h3=c, score=90 if c in hot else 40, lst_c=40.0 if c in hot else 34.0, label="satellite") for c in ring
    ]
    zs = H.cluster_hot_cells(cells)
    assert len(zs) == 1 and {c.h3 for c in zs[0].cells} == hot and zs[0].score == 90
    flat = [H.Cell(h3=c, score=50, lst_c=35.0, label="satellite") for c in ring]
    assert H.cluster_hot_cells(flat) == []
    wet = [
        H.Cell(h3=c, score=90 if c in hot else 40, lst_c=30.0, label="satellite", water=0.8 if c in hot else 0.0)
        for c in ring
    ]
    assert all(set(c.h3 for c in z.cells).isdisjoint(hot) for z in H.cluster_hot_cells(wet))


def test_near_ties():
    assert H.near_ties([90, 88, 70, 60]) == [True, True, False, False]


def test_ring_outline_is_closed_polygon():
    center = h3.latlng_to_cell(23.759, 90.359, 10)
    ring = H.ring_outline(center, 2)
    assert ring[0][0] == ring[0][-1] and len(ring[0]) > 6
    lng, lat = ring[0][0]
    assert 90 < lng < 91 and 23 < lat < 24  # GeoJSON is [lng, lat]


def test_driver_fit_recovers_coefficients():
    rng = np.random.default_rng(1)
    rows = []
    for _ in range(800):
        s, g, w, dk = rng.random(4)
        rows.append(
            {
                "sealed": s,
                "green": g,
                "water": w,
                "dark_surface": dk,
                "anom_day": 4 * s - 3 * g - 5 * w + 1 * dk + rng.normal(0, 0.05),
            }
        )
    # collinear shares (sealed + green ≈ 1) must still give warming sealed and cooling green
    col = []
    for _ in range(800):
        s = rng.random()
        g = 1 - s - rng.random() * 0.05
        col.append(
            {
                "sealed": s,
                "green": g,
                "water": 0.0,
                "dark_surface": rng.random(),
                "anom_day": 3 * s + rng.normal(0, 0.3),
            }
        )
    cfit = D.fit_drivers(col)
    assert cfit.coefs["sealed"] > 0.5 and cfit.coefs["green"] < -0.5  # shared, not all on one
    assert cfit.coefs["water"] <= 0 and cfit.coefs["dark_surface"] >= 0
    fit = D.fit_drivers(rows)
    assert fit.label == "derived" and fit.r2 > 0.9
    # ridge shrinks a little; directions and rough sizes are kept
    assert 3.0 < fit.coefs["sealed"] < 4.2 and -5.2 < fit.coefs["water"] < -3.8 and fit.coefs["green"] < -2
    small = D.fit_drivers(rows[:100])
    assert small.label == "estimate" and small.coefs == D.FALLBACK_COEFS


def test_contributions_causes_why_whatif():
    fit = D.Fit(
        {"sealed": 4.0, "green": -3.0, "water": -5.0, "dark_surface": 1.0},
        {"sealed": 0.5, "green": 0.3, "water": 0.05, "dark_surface": 0.5},
        0.0,
        0.6,
        900,
        "derived",
    )
    vals = {"sealed": 0.95, "green": 0.02, "water": 0.0, "dark_surface": 0.9}
    contribs = D.contributions(vals, fit)
    by = {c["driver"]: c["adds_c"] for c in contribs}
    assert (
        by["sealed"] == pytest.approx(1.8) and by["green"] == pytest.approx(0.84) and by["water"] == pytest.approx(0.25)
    )
    assert D.other_c(3.0, contribs) == pytest.approx(3.0 - sum(by.values()), abs=0.01)
    causes = D.causes(contribs, anom_night=1.2)
    assert causes[0]["code"] == "cause.sealed_surface" and all(c["code"] != "cause.water" for c in causes)
    wi = D.what_if_green(anom_day=2.0, anom_night=None, sealed=0.95, green=0.02, fit=fit)
    assert wi["lst_drop_c"] == pytest.approx(0.3) and wi["score_after"] < H.heat_score(2.0, None, 0.95, 0.02).score
    why = D.why(2.0, contribs, 0.02, 0.95, wi["lst_drop_c"])
    assert why[0] == {"code": "why.hotter", "params": {"delta_c": 2.0}}
    assert why[1]["code"] == "why.two.sealed.green"
    assert why[-1]["code"] == "why.help.green"


def test_heat_index_and_risk():
    assert W.heat_index(25.0, 80) == 25.0  # below 80 °F returns air temperature
    assert W.heat_index(35.0, 60) == pytest.approx(45.1, abs=0.3)
    assert [W.heat_risk(x) for x in (20, 28, 35, 45, 60)] == ["ok", "caution", "xcaution", "danger", "xdanger"]


def test_bmd_bands():
    assert [W.bmd_heat(x) for x in (35.9, 36.0, 37.9, 38.0, 40.0, 42.0)] == [
        None,
        "mild",
        "mild",
        "moderate",
        "severe",
        "very_severe",
    ]
    # four official cold-wave bands (V0 merged severe and very severe)
    assert [W.bmd_cold(x) for x in (10.5, 10.0, 8.0, 6.0, 5.0, 4.0, 2.0)] == [
        None,
        "mild",
        "moderate",
        "severe",
        "severe",
        "very_severe",
        "very_severe",
    ]
    assert [W.bmd_rain(x) for x in (0.5, 1, 10, 11, 22, 23, 43, 44, 88, 88.5)] == [
        None, "light", "light", "moderate", "moderate", "moderately_heavy", "moderately_heavy", "heavy", "heavy", "very_heavy",
    ]  # fmt: skip


def test_in_bangladesh():
    assert W.in_bangladesh(23.759, 90.359) and not W.in_bangladesh(28.61, 77.21) and not W.in_bangladesh(22.57, 88.36)


def test_magnus_rh():
    assert W.magnus_rh(30.0, 30.0) == pytest.approx(100.0)
    assert W.magnus_rh(30.0, 20.0) == pytest.approx(55.3, abs=0.5)


def test_power_normal_window_and_fill():
    series = {}
    for y in range(2001, 2026):
        series[f"{y}1104"] = 29.0
        series[f"{y}1110"] = 28.0
        series[f"{y}0415"] = 36.0
    series["20101105"] = -999.0
    clean = W.clean_power(series)
    assert "20101105" not in clean
    assert W.normal_for(clean, date(2026, 11, 4)) == 28.5
    assert W.normal_for(clean, date(2026, 4, 15)) == 36.0


def test_local_day_aggregation_from_utc():
    # 18:30 UTC on 3 Nov is 00:30 on 4 Nov in Dhaka (UTC+6)
    hours = [
        (datetime(2026, 11, 3, 17, 30, tzinfo=UTC), 25.0),
        (datetime(2026, 11, 3, 18, 30, tzinfo=UTC), 24.0),
        (datetime(2026, 11, 4, 7, 30, tzinfo=UTC), 32.0),
        (datetime(2026, 11, 4, 8, 30, tzinfo=UTC), 1.0e15),
    ]
    days = W.local_days(hours, 6 * 3600)
    assert days["2026-11-03"] == {"tmax": 25.0, "tmin": 25.0, "n": 1}
    assert days["2026-11-04"] == {"tmax": 32.0, "tmin": 24.0, "n": 2}  # the GEOS fill is dropped


def test_hot_season():
    m = {i: [20.0] for i in range(1, 13)}
    m[4] = m[5] = m[6] = [36.0]
    assert W.summarize_hot_season(m) == [4, 5, 6]
