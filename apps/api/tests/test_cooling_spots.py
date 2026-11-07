import h3
import pytest

from app.engines import cooling as CO
from app.services import spots


def test_tree_ramp_points():
    assert [CO.tree_ramp(t) for t in (0, 1, 3, 5, 8, 12)] == [0, 0.2, 0.5, 0.8, 1, 1]
    assert CO.tree_ramp(2) == pytest.approx(0.35)


def test_coefficients_floor_area():
    assert CO.tree_c(0.01) == CO.tree_c(0.1) == pytest.approx(0.006)
    assert CO.roof_c(1.0) == pytest.approx(0.00004)
    assert CO.action_cooling("cool_roof", 100, 1.0) == pytest.approx(0.004)


def test_capacity_and_mix_shift():
    space = {"ground_m2": 500, "roof_m2": 10000, "roadside_m": 80}
    assert CO.capacity(**space) == {"trees": 30, "roof_m2": 6000}
    mix = CO.plan_mix(-1.0, 0.2, space)
    assert mix["trees"] == 30 and mix["roof_m2"] > 0  # trees capped by space, the rest moved to roofs


def test_e9_short_goal_with_no_ground_is_not_recommended():
    """E9: −2 °C in one year with 0 m² open ground must not be 'yes'."""
    space = {"ground_m2": 0, "roof_m2": 2000, "roadside_m": 0}
    f = CO.feasibility(-2.0, 0.05, space, years=1)
    assert f["feasible"] == "no" and f["kind"] == "action"
    assert f["recommended_target_c"] is None or f["recommended_target_c"] > -2.0


def test_recommend_uses_timeline():
    space = {"ground_m2": 5000, "roof_m2": 5000, "roadside_m": 400}
    one = CO.recommend(0.1, space, 1)
    eight = CO.recommend(0.1, space, 8)
    assert one["kind"] == "action" and eight["kind"] == "cooling"
    assert eight["achievable_c"] > one["achievable_c"]


def test_projection_lines():
    p = CO.project(35.0, 0.03, 0.1, trees=100, roof_m2=1000, shade=1, start_year=2026, end_year=2034)
    assert p["years"][0] == 2026 and p["without_c"][-1] == pytest.approx(35.24)
    assert p["with_c"][0] == p["without_c"][0]  # nothing planted yet at t=0
    assert p["without_c"][-1] - p["with_c"][-1] == pytest.approx(100 * 0.006 + 1000 * 0.0004 + 0.002, abs=0.01)
    assert CO.linear_trend([(2003, 30), (2004, 30.1), (2005, 30.2), (2006, 30.3), (2007, 30.4)]) == pytest.approx(0.1)


def _square(lat, lng, d, id_, tags):
    g = [
        {"lat": lat - d, "lon": lng - d},
        {"lat": lat - d, "lon": lng + d},
        {"lat": lat + d, "lon": lng + d},
        {"lat": lat + d, "lon": lng - d},
        {"lat": lat - d, "lon": lng - d},
    ]
    return {"type": "way", "id": id_, "tags": tags, "geometry": g}


def test_e8_roofs_clipped_and_invariant():
    c = h3.latlng_to_cell(23.759, 90.359, 10)
    cells = list(h3.grid_disk(c, 1))
    zone = spots.zone_polygon(cells)
    lat, lng = zone.centroid.y, zone.centroid.x
    els = [
        # one huge building far larger than the zone: V0 counted it whole by centroid
        _square(lat, lng, 0.01, 1, {"building": "yes", "roof:shape": "flat"}),
        _square(lat + 0.0005, lng, 0.0003, 2, {"leisure": "park", "name": "Park"}),
        {
            "type": "way",
            "id": 3,
            "tags": {"highway": "residential"},
            "geometry": [{"lat": lat, "lon": lng - 0.01}, {"lat": lat, "lon": lng + 0.01}],
        },
    ]
    out = spots.build(els, zone)
    t = out["totals"]
    assert t["roof_m2"] + t["ground_m2"] <= out["zone_area_m2"]
    assert t["roof_m2"] <= out["zone_area_m2"]
    assert t["roadside_m"] > 0 and any(f["properties"]["kind"] == "roadside" for f in out["features"])
