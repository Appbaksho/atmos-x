"""Pure tests: verification checks (§7.11), tree states (T3), levels and badge rules."""

from datetime import UTC, datetime, timedelta

from app.engines import progress as PR
from app.engines import trees as TR
from app.engines import verify as V

NOW = datetime(2026, 11, 8, 6, 0, tzinfo=UTC)


def ev(**kw) -> V.Evidence:
    base = dict(
        action_type="plant_tree",
        content_check="green",
        is_ground=True,
        lat=23.78,
        lng=90.41,
        accuracy_m=12,
        taken_at=NOW - timedelta(minutes=5),
        now=NOW,
        capture_source="camera",
        exif_time=None,
        exif_lat=None,
        exif_lng=None,
        has_photo=True,
        phash_min_distance=40,
        green_share=0.3,
        bright_share=0.1,
        target_dist_m=50,
        hex_water_share=0.1,
        inside_building=False,
    )
    base.update(kw)
    return V.Evidence(**base)


def by_code(checks):
    return {c["code"]: c for c in checks}


def test_all_pass_is_verified():
    checks = V.check(ev())
    assert [c["code"] for c in checks] == V.ORDER
    assert V.verdict(checks) == ("verified", None)


def test_each_failure_gives_its_reason():
    cases = [
        (dict(lat=None, lng=None), "gps_present", "gps_missing"),
        (dict(accuracy_m=500), "gps_present", "gps_inaccurate"),
        (dict(target_dist_m=900), "gps_near", "gps_far"),
        (dict(hex_water_share=0.95), "location_plausible", "on_water"),
        (dict(inside_building=True), "location_plausible", "inside_building"),
        (dict(taken_at=NOW - timedelta(hours=30)), "time_recent", "too_old"),
        (dict(taken_at=NOW + timedelta(hours=1)), "time_recent", "time_future"),
        (dict(has_photo=False), "capture_source", "no_photo"),
        (dict(capture_source="upload"), "capture_source", "exif_mismatch"),
        (dict(phash_min_distance=3), "not_duplicate", "duplicate_photo"),
        (dict(green_share=0.01), "content_plausible", "not_green"),
    ]
    for kw, code, reason in cases:
        checks = V.check(ev(**kw))
        c = by_code(checks)[code]
        assert c["status"] == "fail", (kw, c)
        assert c["reason"] == reason
        status, why = V.verdict(checks)
        assert status == "pending" and why is not None


def test_upload_with_matching_exif_passes_and_uses_local_offset():
    # A camera in Dhaka (UTC+6) writes local wall time with no zone.
    local = (NOW - timedelta(minutes=5)).replace(tzinfo=None) + timedelta(hours=6)
    c = by_code(V.check(ev(capture_source="upload", exif_time=local, exif_lat=23.7801, exif_lng=90.4101)))
    assert c["capture_source"]["status"] == "pass"
    # Off by 3 hours is not a match.
    c = by_code(
        V.check(ev(capture_source="upload", exif_time=local + timedelta(hours=3), exif_lat=23.78, exif_lng=90.41))
    )
    assert c["capture_source"]["status"] == "fail"


def test_roof_content_and_too_fast():
    c = by_code(V.check(ev(action_type="cool_roof", content_check="roof", is_ground=False, bright_share=0.1)))
    assert c["content_plausible"]["reason"] == "not_roof"
    c = by_code(
        V.check(
            ev(action_type="cool_roof", content_check="roof", is_ground=False, bright_share=0.5, inside_building=True)
        )
    )
    assert c["location_plausible"]["status"] == "pass"  # roofs are on buildings
    c = by_code(
        V.check(ev(prev_lat=22.33, prev_lng=91.83, prev_at=NOW - timedelta(minutes=30)))
    )  # Chattogram 30 min ago
    assert c["location_plausible"]["reason"] == "too_fast"


def tree_state(**kw):
    base = dict(
        verified=True,
        revoked=False,
        lost_confirmed=False,
        planted_at=NOW - timedelta(days=40),
        next_due_at=NOW + timedelta(days=10),
        healths=["healthy"],
        now=NOW,
        rain_7d_mm=20.0,
        rain_forecast_3d_mm=5.0,
    )
    base.update(kw)
    return TR.state(**base)


def test_tree_states_first_match_wins():
    assert tree_state() == "healthy"
    assert tree_state(verified=False) == "verifying"
    assert tree_state(healths=["dead", "healthy"]) == "lost"
    assert tree_state(next_due_at=NOW - timedelta(days=50)) == "at_risk"  # not confirmed lost
    assert tree_state(next_due_at=NOW - timedelta(days=50), lost_confirmed=True) == "lost"
    assert tree_state(next_due_at=NOW - timedelta(days=16)) == "at_risk"
    assert tree_state(healths=["stressed", "stressed"]) == "at_risk"
    assert tree_state(healths=["stressed", "healthy"]) == "needs_water"
    # Dry season (November), young tree, < 5 mm in 7 days and none forecast → needs water.
    assert tree_state(rain_7d_mm=1.0, rain_forecast_3d_mm=0.0) == "needs_water"
    assert tree_state(rain_7d_mm=1.0, rain_forecast_3d_mm=4.0) == "healthy"
    assert tree_state(rain_7d_mm=1.0, rain_forecast_3d_mm=0.0, planted_at=NOW - timedelta(days=900)) == "healthy"
    assert (
        tree_state(rain_7d_mm=1.0, now=NOW.replace(month=7), next_due_at=NOW.replace(month=7) + timedelta(days=10))
        == "healthy"
    )
    assert tree_state(next_due_at=NOW + timedelta(days=1)) == "due"
    assert tree_state(next_due_at=NOW - timedelta(days=5)) == "due"


def test_on_time_window_and_tips():
    due = NOW
    assert TR.on_time(due, NOW - timedelta(days=3))
    assert TR.on_time(due, NOW + timedelta(days=3))
    assert not TR.on_time(due, NOW + timedelta(days=4))
    assert not TR.on_time(due, NOW - timedelta(days=4))
    tips = TR.tips(species_water="high", month=12, rain_7d_mm=1, health="stressed", age_days=30)
    assert [t["code"] for t in tips] == ["tree.tip.stressed", "tree.tip.water_dry", "tree.tip.guard"]
    assert TR.tips(species_water="low", month=12, rain_7d_mm=None, health="dead", age_days=30) == [
        {"code": "tree.tip.replant"}
    ]


def test_levels_and_badge_rules():
    assert PR.level_for(0)["level"] == 1
    assert PR.level_for(650) == {"level": 3, "name_code": "level.shade_maker", "min": 600, "next": 1500}
    assert PR.level_for(20000)["next"] is None
    assert PR.badge_earned({"kind": "trees_alive", "n": 10}, {"trees_alive": 10})
    assert not PR.badge_earned({"kind": "planted_months", "months": [6, 7]}, {"planted_months": [11]})
    assert PR.badge_earned({"kind": "tree_milestone", "m": "d90"}, {"milestone_d90": 1})
