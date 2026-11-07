"""Cooling, capacity, feasibility and projection maths (prompt-v1 §7.6, §7.10). Pure functions.

Coefficients (conservative, order-of-magnitude, from urban-heat literature; shown as estimates):
  +1 % tree canopy in 1 km² lowers daytime surface temperature by ~0.1–0.2 °C (Ziter et al. 2019;
  Schwaab et al. 2021). One mature street tree ≈ 50 m² crown, so 200 trees ≈ 1 % of a km² →
  ≈ 0.12 °C, i.e. 0.0006 °C per tree per km². Cool roofs: ≈ 0.04 °C per 1 % of a km² (Santamouris
  2014) → 0.0004 °C per 10 m² per km². A zone's cooling = coefficient / zone area, floored at
  0.1 km² because the literature values are neighbourhood scale.
"""

from __future__ import annotations

import math

COOLING_PER_KM2 = {
    "plant_tree": 0.0006,
    "plant_shrubs": 0.0001,
    "rooftop_garden": 0.0003,  # per 10 m²
    "cool_roof": 0.0004,  # per 10 m²
    "green_wall": 0.00015,  # per 5 m²
    "shade_structure": 0.0002,
    "water_tree": 0.0,
    "awareness": 0.0,
}
UNIT_M2 = {"cool_roof": 10, "rooftop_garden": 10, "green_wall": 5}
MIN_AREA_KM2 = 0.1

SAPLING_M2 = 25.0
ROADSIDE_SPACING_M = 8.0
ROOF_USABLE = 0.6
TREE_SHARE = 0.7
RECOMMEND_SHARE = 0.85
ACTION_GOAL_YEARS = 3.0

RAMP = [(0.0, 0.0), (1.0, 0.2), (3.0, 0.5), (5.0, 0.8), (8.0, 1.0)]


def eff_area(area_km2: float) -> float:
    return max(MIN_AREA_KM2, area_km2)


def tree_c(area_km2: float) -> float:
    return COOLING_PER_KM2["plant_tree"] / eff_area(area_km2)


def roof_c(area_km2: float) -> float:
    """°C per m² of cool roof."""
    return COOLING_PER_KM2["cool_roof"] / 10 / eff_area(area_km2)


def shade_c(area_km2: float) -> float:
    return COOLING_PER_KM2["shade_structure"] / eff_area(area_km2)


def action_cooling(action_type: str, quantity: float, area_km2: float) -> float:
    per = COOLING_PER_KM2.get(action_type, 0.0)
    unit = UNIT_M2.get(action_type, 1)
    return per * (quantity / unit) / eff_area(area_km2)


def tree_ramp(years: float) -> float:
    """A tree delivers 20 % at year 1, 50 % at year 3, 80 % at year 5, 100 % from year 8 (§6.6 G2)."""
    if years <= 0:
        return 0.0
    if years >= 8:
        return 1.0
    for (x0, y0), (x1, y1) in zip(RAMP, RAMP[1:], strict=False):
        if years <= x1:
            return y0 + (years - x0) / (x1 - x0) * (y1 - y0)
    return 1.0


def capacity(ground_m2: float, roof_m2: float, roadside_m: float) -> dict:
    return {
        "trees": math.floor(ground_m2 / SAPLING_M2 + roadside_m / ROADSIDE_SPACING_M),
        "roof_m2": math.floor(roof_m2 * ROOF_USABLE),
    }


def shades_for(area_km2: float) -> int:
    return max(1, round(area_km2 / 0.1))


def plan_mix(target_c: float, area_km2: float, space: dict | None) -> dict:
    """Split the target 70/30 between trees and cool roofs; shift work when one side runs out."""
    target = max(0.1, abs(target_c))
    tc, rc = tree_c(area_km2), roof_c(area_km2)
    shade = shades_for(area_km2)
    rest = max(0.0, target - shade * shade_c(area_km2))
    trees = math.ceil(rest * TREE_SHARE / tc)
    roof = math.ceil(rest * (1 - TREE_SHARE) / rc / 10) * 10
    needed = {"trees": trees, "roof_m2": roof, "shade": shade}
    if space:
        cap = capacity(space["ground_m2"], space["roof_m2"], space["roadside_m"])
        if trees > cap["trees"] and roof < cap["roof_m2"]:
            missing = (trees - cap["trees"]) * tc
            trees = cap["trees"]
            roof = math.ceil((roof + missing / rc) / 10) * 10
        elif roof > cap["roof_m2"] and trees < cap["trees"]:
            missing = (roof - cap["roof_m2"]) * rc
            roof = math.floor(cap["roof_m2"] / 10) * 10
            trees = math.ceil(trees + missing / tc)
    cooling = round(trees * tc + roof * rc + shade * shade_c(area_km2), 2)
    return {"trees": trees, "roof_m2": roof, "shade": shade, "cooling_c": cooling, "needed": needed}


def achievable_c(area_km2: float, space: dict, years: float) -> float:
    """§7.10: cap.trees × tree_c × treeRamp(t) + cap.roof_m2 × roof_c + shade."""
    cap = capacity(space["ground_m2"], space["roof_m2"], space["roadside_m"])
    return (
        cap["trees"] * tree_c(area_km2) * tree_ramp(years)
        + cap["roof_m2"] * roof_c(area_km2)
        + shades_for(area_km2) * shade_c(area_km2)
    )


def recommend(area_km2: float, space: dict | None, years: float) -> dict:
    """Largest target ≤ 85 % of what is achievable by the date; under 3 years it is an action goal."""
    if not space:
        return {
            "recommended_target_c": None,
            "achievable_c": None,
            "kind": "action" if years < ACTION_GOAL_YEARS else "cooling",
        }
    ach = achievable_c(area_km2, space, years)
    rec = math.floor(ach * RECOMMEND_SHARE * 10) / 10
    long_term = achievable_c(area_km2, space, 8)
    return {
        "recommended_target_c": -rec if rec > 0 else None,
        "achievable_c": round(ach, 2),
        "long_term_c": round(long_term, 2),
        "kind": "action" if years < ACTION_GOAL_YEARS else "cooling",
    }


def feasibility(target_c: float, area_km2: float, space: dict | None, years: float) -> dict:
    mix = plan_mix(target_c, area_km2, space)
    notes: list[dict] = []
    verdict = "stretch"
    if space:
        cap = capacity(space["ground_m2"], space["roof_m2"], space["roadside_m"])
        kt = mix["trees"] / cap["trees"] if cap["trees"] else (math.inf if mix["trees"] else 0)
        kr = mix["roof_m2"] / cap["roof_m2"] if cap["roof_m2"] else (math.inf if mix["roof_m2"] else 0)
        k = max(kt, kr)
        # The date matters too (G2): trees reach full effect only from year 8.
        ach = achievable_c(area_km2, space, years)
        if ach < abs(target_c):
            k = max(k, 1.01)
        verdict = "yes" if k <= 0.6 else ("stretch" if k <= 1 else "no")
        notes.append({"code": "feas.trees_vs_space", "params": {"trees": mix["trees"], "capacity": cap["trees"]}})
        notes.append(
            {"code": "feas.roofs_vs_space", "params": {"roof_m2": mix["roof_m2"], "capacity_m2": cap["roof_m2"]}}
        )
        if verdict == "no":
            notes.append({"code": "feas.max_cooling", "params": {"max_c": round(ach, 1), "years": round(years, 1)}})
    else:
        notes.append({"code": "feas.spots_unknown"})
    if years < ACTION_GOAL_YEARS:
        notes.append({"code": "feas.action_goal"})
    if years < 8 and mix["trees"] > 0:
        notes.append({"code": "feas.trees_take_years", "params": {"ramp_pct": round(tree_ramp(years) * 100)}})
    rec = recommend(area_km2, space, years)
    return {
        "feasible": verdict,
        "needed": {"trees": mix["trees"], "roof_m2": mix["roof_m2"], "shade": mix["shade"]},
        "capacity": capacity(space["ground_m2"], space["roof_m2"], space["roadside_m"]) if space else None,
        "spots_available": {
            "ground_m2": (space or {}).get("ground_m2", 0),
            "roof_m2": (space or {}).get("roof_m2", 0),
            "roadside_m": (space or {}).get("roadside_m", 0),
        },
        "achievable_c": rec["achievable_c"],
        "recommended_target_c": rec["recommended_target_c"],
        "kind": rec["kind"],
        "notes": notes,
        "mix": mix,
    }


def project(
    now_c: float,
    per_year_c: float,
    area_km2: float,
    trees: int,
    roof_m2: float,
    shade: int,
    start_year: int,
    end_year: int = 2040,
) -> dict:
    years = list(range(start_year, end_year + 1))
    without = [round(now_c + per_year_c * (y - start_year), 2) for y in years]
    fixed = roof_m2 * roof_c(area_km2) + shade * shade_c(area_km2)
    with_c = []
    for y, w in zip(years, without, strict=True):
        t = y - start_year
        cool = trees * tree_c(area_km2) * tree_ramp(t) + (fixed if t >= 1 else 0)
        with_c.append(round(w - cool, 2))
    return {"years": years, "without_c": without, "with_c": with_c}


def linear_trend(points: list[tuple[int, float]]) -> float | None:
    """Least-squares slope (°C per year)."""
    if len(points) < 5:
        return None
    n = len(points)
    mx = sum(p[0] for p in points) / n
    my = sum(p[1] for p in points) / n
    sxx = sum((p[0] - mx) ** 2 for p in points)
    if sxx == 0:
        return None
    return sum((p[0] - mx) * (p[1] - my) for p in points) / sxx
