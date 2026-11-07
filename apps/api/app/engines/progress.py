"""Levels (from earned points) and badge rules (prompt-v1 §6.7). Pure."""

from __future__ import annotations

LEVELS = [
    ("seedling", 0),
    ("sapling", 200),
    ("shade_maker", 600),
    ("canopy_keeper", 1500),
    ("heat_breaker", 4000),
    ("climate_guardian", 10000),
]


def level_for(points: int) -> dict:
    idx = 0
    for i, (_, mn) in enumerate(LEVELS):
        if points >= mn:
            idx = i
    nxt = LEVELS[idx + 1][1] if idx + 1 < len(LEVELS) else None
    return {"level": idx + 1, "name_code": f"level.{LEVELS[idx][0]}", "min": LEVELS[idx][1], "next": nxt}


def badge_earned(rule: dict, facts: dict) -> bool:
    k = rule["kind"]
    if k == "trees_verified":
        return facts.get("trees_verified", 0) >= rule["n"]
    if k == "trees_alive":
        return facts.get("trees_alive", 0) >= rule["n"]
    if k == "tree_milestone":
        return facts.get(f"milestone_{rule['m']}", 0) >= 1
    if k == "planted_months":
        return bool(set(facts.get("planted_months", [])) & set(rule["months"]))
    if k == "roof_m2_verified":
        return facts.get("roof_m2_verified", 0) >= rule["n"]
    if k == "team_goal_reached":
        return facts.get("team_goals_reached", 0) >= rule["n"]
    if k == "ontime_checks_streak":
        return facts.get("ontime_streak", 0) >= rule["n"]
    if k == "points_earned":
        return facts.get("points_earned", 0) >= rule["n"]
    return False
