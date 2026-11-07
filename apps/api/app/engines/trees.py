"""Tree states, check-in timing and care tips (prompt-v1 §6.7 T3, T6). Pure; thresholds in CFG."""

from __future__ import annotations

from datetime import datetime, timedelta

CFG = {
    "every_days": 15,
    "due_within_days": 2,
    "at_risk_overdue_days": 15,
    "lost_overdue_days": 45,
    "young_years": 2,
    "dry_rain_mm_7d": 5,
    "dry_forecast_days": 3,
    "dry_months": [11, 12, 1, 2, 3, 4],
    "on_time_early_days": 3,
    "on_time_late_days": 3,
    "milestone_d90": 90,
    "milestone_y1": 365,
}


def next_due(from_dt: datetime) -> datetime:
    return from_dt + timedelta(days=CFG["every_days"])


def state(
    *,
    verified: bool,
    revoked: bool,
    lost_confirmed: bool,
    planted_at: datetime,
    next_due_at: datetime,
    healths: list[str],  # newest first
    now: datetime,
    rain_7d_mm: float | None,
    rain_forecast_3d_mm: float | None,
) -> str:
    """verifying | lost | at_risk | needs_water | due | healthy (T3, first match wins)."""
    if revoked or not verified:
        return "verifying"
    overdue = (now - next_due_at).days
    if (healths and healths[0] == "dead") or (overdue > CFG["lost_overdue_days"] and lost_confirmed):
        return "lost"
    if overdue > CFG["at_risk_overdue_days"] or (len(healths) >= 2 and healths[0] == healths[1] == "stressed"):
        return "at_risk"
    young = (now - planted_at).days < 365 * CFG["young_years"]
    dry = (
        young
        and now.month in CFG["dry_months"]
        and rain_7d_mm is not None
        and rain_7d_mm < CFG["dry_rain_mm_7d"]
        and (rain_forecast_3d_mm is None or rain_forecast_3d_mm < 1)
    )
    if (healths and healths[0] == "stressed") or dry:
        return "needs_water"
    if (next_due_at - now).days <= CFG["due_within_days"]:
        return "due"
    return "healthy"


def on_time(due_at: datetime, at: datetime) -> bool:
    return due_at - timedelta(days=CFG["on_time_early_days"]) <= at <= due_at + timedelta(days=CFG["on_time_late_days"])


def tips(*, species_water: str, month: int, rain_7d_mm: float | None, health: str | None, age_days: int) -> list[dict]:
    out: list[dict] = []
    if health == "dead":
        return [{"code": "tree.tip.replant"}]
    if health == "stressed":
        out.append({"code": "tree.tip.stressed"})
    if rain_7d_mm is not None and rain_7d_mm < CFG["dry_rain_mm_7d"] and month in CFG["dry_months"]:
        out.append({"code": "tree.tip.water_dry", "params": {"rain_mm": round(rain_7d_mm, 1)}})
    elif rain_7d_mm is not None and rain_7d_mm > 60:
        out.append({"code": "tree.tip.drainage", "params": {"rain_mm": round(rain_7d_mm)}})
    if age_days < 365:
        out.append({"code": "tree.tip.guard"})
    if species_water == "high":
        out.append({"code": "tree.tip.thirsty"})
    if month in (6, 7, 8, 9):
        out.append({"code": "tree.tip.monsoon"})
    return out[:3] or [{"code": "tree.tip.keep_going"}]
