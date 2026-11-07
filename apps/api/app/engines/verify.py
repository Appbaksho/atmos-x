"""Deterministic action verification (prompt-v1 §7.11). Pure functions; thresholds are config.

All checks pass → verified. Otherwise pending with the first failing reason, and it goes to review by
a different person (a teammate or a moderator). The content check is a rough heuristic and says so.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from .heat import haversine_m

CFG = {
    "gps_max_accuracy_m": 100,
    "gps_near_m": 300,
    "max_speed_kmh": 120,
    "taken_max_age_h": 24,
    "taken_max_future_min": 10,
    "exif_time_tol_min": 30,
    "exif_gps_tol_m": 300,
    "dup_hamming": 6,
    "green_min_share": 0.08,
    "roof_min_bright": 0.25,
    "water_max_share": 0.9,
}

ORDER = [
    "gps_present",
    "gps_near",
    "location_plausible",
    "time_recent",
    "capture_source",
    "not_duplicate",
    "content_plausible",
]


@dataclass
class Evidence:
    action_type: str
    content_check: str  # green | roof | none
    is_ground: bool
    lat: float | None
    lng: float | None
    accuracy_m: float | None
    taken_at: datetime | None
    now: datetime
    capture_source: str  # camera | upload
    exif_time: datetime | None
    exif_lat: float | None
    exif_lng: float | None
    has_photo: bool
    phash_min_distance: int | None  # to any earlier photo
    green_share: float | None
    bright_share: float | None
    target_dist_m: float | None  # distance to the goal zone polygon (0 inside), None = no target
    hex_water_share: float | None
    inside_building: bool | None
    prev_lat: float | None = None
    prev_lng: float | None = None
    prev_at: datetime | None = None


def check(e: Evidence) -> list[dict]:
    out: list[dict] = []

    def add(code: str, ok: bool | None, reason: str | None = None, **params) -> None:
        out.append(
            {
                "code": code,
                "status": "pass" if ok else ("skip" if ok is None else "fail"),
                "reason": None if ok or ok is None else reason,
                "params": params,
            }
        )

    have_gps = e.lat is not None and e.lng is not None
    add(
        "gps_present",
        have_gps and (e.accuracy_m is None or e.accuracy_m <= CFG["gps_max_accuracy_m"]),
        "gps_missing" if not have_gps else "gps_inaccurate",
        accuracy_m=round(e.accuracy_m or 0),
    )
    if e.target_dist_m is None:
        add("gps_near", True)
    else:
        add("gps_near", e.target_dist_m <= CFG["gps_near_m"], "gps_far", dist_m=round(e.target_dist_m))
    plaus = True
    reason = None
    if e.hex_water_share is not None and e.hex_water_share >= CFG["water_max_share"]:
        plaus, reason = False, "on_water"
    if plaus and e.is_ground and e.inside_building:
        plaus, reason = False, "inside_building"
    if plaus and have_gps and e.prev_lat is not None and e.prev_at and e.taken_at:
        hours = abs((e.taken_at - e.prev_at).total_seconds()) / 3600
        km = haversine_m(e.lat, e.lng, e.prev_lat, e.prev_lng) / 1000
        if hours > 0 and km / hours > CFG["max_speed_kmh"] and km > 1:
            plaus, reason = False, "too_fast"
    add("location_plausible", plaus if have_gps else None, reason)
    if e.taken_at is None:
        add("time_recent", False, "time_unknown")
    elif e.taken_at > e.now + timedelta(minutes=CFG["taken_max_future_min"]):
        add("time_recent", False, "time_future")
    else:
        add("time_recent", e.now - e.taken_at <= timedelta(hours=CFG["taken_max_age_h"]), "too_old")
    if not e.has_photo:
        add("capture_source", False, "no_photo")
    elif e.capture_source == "camera":
        add("capture_source", True)
    else:
        ok_time = False
        if e.exif_time is not None and e.taken_at is not None:
            # EXIF times are camera-local with no zone: compare with the claim at the zone of the photo's
            # longitude (whole hours), and also as UTC for cameras set to UTC.
            claim = e.taken_at.replace(tzinfo=None)
            shot = e.exif_time.replace(tzinfo=None)
            offs = [0.0] + ([round((e.lng or 0) / 15)] if have_gps else [])
            ok_time = any(
                abs((shot - (claim + timedelta(hours=h))).total_seconds()) <= CFG["exif_time_tol_min"] * 60
                for h in offs
            )
        ok_gps = (
            e.exif_lat is not None
            and have_gps
            and haversine_m(e.lat, e.lng, e.exif_lat, e.exif_lng) <= CFG["exif_gps_tol_m"]
        )
        add("capture_source", ok_time and ok_gps, "exif_mismatch")
    if not e.has_photo or e.phash_min_distance is None:
        add("not_duplicate", True if e.has_photo else None)
    else:
        add(
            "not_duplicate", e.phash_min_distance > CFG["dup_hamming"], "duplicate_photo", distance=e.phash_min_distance
        )
    if not e.has_photo or e.content_check == "none":
        add("content_plausible", None)
    elif e.content_check == "green":
        add(
            "content_plausible",
            (e.green_share or 0) >= CFG["green_min_share"],
            "not_green",
            share=round(e.green_share or 0, 2),
        )
    else:
        add(
            "content_plausible",
            (e.bright_share or 0) >= CFG["roof_min_bright"],
            "not_roof",
            share=round(e.bright_share or 0, 2),
        )
    return out


def verdict(checks: list[dict]) -> tuple[str, str | None]:
    for c in checks:
        if c["status"] == "fail":
            return "pending", c["reason"]
    return "verified", None
