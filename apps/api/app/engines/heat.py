"""Heat Score v1 and zone maths (prompt-v1 §7.2–§7.5). Pure functions, no I/O.

    score = 100 × ( 0.55 · f(anom_day,   −6, +6)
                  + 0.15 · f(anom_night, −3, +3)
                  + 0.15 · sealed
                  + 0.10 · (1 − green)
                  + 0.05 · pop_pct )
    f(x, lo, hi) = clamp((x − lo) / (hi − lo), 0, 1)

Terms whose input is missing (night, population) are dropped and the remaining weights
re-normalized. The weights are a transparent index, not physics.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

import h3

H3_RES = 10
CHUNK_RES = 7
# Neighbour spacing at res 10 measured at Dhaka (prompt-v1 §6.4 H2).
HEX_SPACING_M = 135.0
RADIUS_PRESETS = (200, 500, 1000)
GUEST_MAX_RADIUS_M = 500

HEAT = {
    "weights": {"day": 0.55, "night": 0.15, "sealed": 0.15, "not_green": 0.10, "pop": 0.05},
    # Calibrated on Dhaka Mar–May 2026 (P5 −4.0, P95 +3.3 °C): built-up blocks ≈ 72, trees ≈ 29.
    "day_range": (-6.0, 6.0),
    "night_range": (-3.0, 3.0),
    # Population share: density / this, clamped. 40,000 people/km² is a dense South Asian ward.
    "pop_ref_km2": 40_000.0,
    "water_max_for_zone": 0.5,
    "hot_quantile": 0.75,
    "near_tie": 3,
    "max_zones": 12,
    "what_if_green": 0.10,
    # A hex needs this many valid 30 m pixels and clear observations to be 'satellite' (§7.1 step 4).
    "min_valid_px": 8,
    "min_obs": 2,
    # ECOSTRESS blend of the relative day pattern (§7.1 step 9): a design choice.
    "blend_landsat": 0.7,
    "blend_ecostress": 0.3,
}

# Land-cover estimate (only for hexes with no LST): ported from V0 heat/config.ts. These are
# assumptions, labelled 'estimate' in the UI. est_c = tmax + 9·sealed − 6·green − 8·water.
EST = {"sealed": 9.0, "green": -6.0, "water": -8.0}

# V0 daytime coefficients used for driver °C shares when a regional fit is unavailable (§7.4).
FALLBACK_COEFS = {"sealed": 9.0, "green": -6.0, "water": -8.0, "dark_surface": 2.0}


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def f(x: float, lo: float, hi: float) -> float:
    return clamp((x - lo) / (hi - lo), 0.0, 1.0)


def k_for_radius(radius_m: float) -> int:
    """k = ceil(radius / 135 m): 200 m → 2 (19 hexes), 500 m → 4 (61), 1 km → 8 (217)."""
    return max(1, math.ceil(radius_m / HEX_SPACING_M))


def ring_count(k: int) -> int:
    return 1 + 3 * k * (k + 1)


def pop_pct(density_km2: float | None) -> float | None:
    if density_km2 is None:
        return None
    return clamp(density_km2 / HEAT["pop_ref_km2"], 0.0, 1.0)


@dataclass
class ScoreResult:
    score: int
    terms: list[str]
    parts: dict[str, float]


def heat_score(
    anom_day: float | None,
    anom_night: float | None,
    sealed: float | None,
    green: float | None,
    pop_density_km2: float | None = None,
) -> ScoreResult | None:
    """Score one hex. Returns None when there is neither a day anomaly nor land cover."""
    w = HEAT["weights"]
    parts: dict[str, float] = {}
    if anom_day is not None:
        parts["day"] = f(anom_day, *HEAT["day_range"])
    if anom_night is not None:
        parts["night"] = f(anom_night, *HEAT["night_range"])
    if sealed is not None:
        parts["sealed"] = clamp(sealed, 0, 1)
    if green is not None:
        parts["not_green"] = 1 - clamp(green, 0, 1)
    pp = pop_pct(pop_density_km2)
    if pp is not None:
        parts["pop"] = pp
    if "day" not in parts and "sealed" not in parts:
        return None
    total_w = sum(w[k] for k in parts)
    s = sum(w[k] * v for k, v in parts.items()) / total_w
    return ScoreResult(score=round(100 * s), terms=sorted(parts), parts={k: round(v, 3) for k, v in parts.items()})


def est_lst_c(tmax_c: float, sealed: float, green: float, water: float) -> float:
    """Land-cover estimate of surface temperature for a hex with no LST (labelled estimate)."""
    return tmax_c + EST["sealed"] * sealed + EST["green"] * green + EST["water"] * water


def formula() -> dict:
    return {
        "text": "score = 100 × (0.55·f(anom_day, −6, +6) + 0.15·f(anom_night, −3, +3) + 0.15·sealed + 0.10·(1 − green) + 0.05·pop_pct)",
        "f": "f(x, lo, hi) = clamp((x − lo)/(hi − lo), 0, 1)",
        "weights": HEAT["weights"],
        "day_range_c": HEAT["day_range"],
        "night_range_c": HEAT["night_range"],
        "missing_terms": "dropped and the rest re-normalized",
        "h3_res": H3_RES,
        "estimate_formula": "est_c = Tmax + 9·sealed − 6·green − 8·water (assumption, labelled estimate)",
    }


# ── Zones (§7.3) ─────────────────────────────────────────────────────────────


@dataclass
class Cell:
    h3: str
    score: int
    lst_c: float | None
    label: str
    water: float | None = None


@dataclass
class Cluster:
    cells: list[Cell]
    score: int
    lst_c: float | None


def quantile(values: Sequence[float], q: float) -> float:
    s = sorted(values)
    if not s:
        return float("nan")
    pos = (len(s) - 1) * q
    lo = math.floor(pos)
    hi = math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def median(values: Sequence[float]) -> float:
    return quantile(values, 0.5)


def mean(values: Iterable[float]) -> float:
    v = list(values)
    return sum(v) / len(v) if v else float("nan")


def cluster_hot_cells(cells: list[Cell], q: float | None = None) -> list[Cluster]:
    """Connected components (H3 neighbours) of the scan's top-quartile hexes, ranked by mean score.

    Ties at the threshold count only when the threshold is above the median (a flat scan has no zones).
    Hexes that are ≥ 50 % water are not eligible.
    """
    q = HEAT["hot_quantile"] if q is None else q
    eligible = [c for c in cells if c.label != "no_data" and (c.water is None or c.water < HEAT["water_max_for_zone"])]
    if not eligible:
        return []
    scores = [c.score for c in eligible]
    thr = quantile(scores, q)
    med = median(scores)
    hot = {c.h3: c for c in eligible if c.score > thr or (c.score == thr and thr > med)}
    seen: set[str] = set()
    out: list[Cluster] = []
    for start in list(hot.values()):
        if start.h3 in seen:
            continue
        members: list[Cell] = []
        stack = [start]
        seen.add(start.h3)
        while stack:
            cur = stack.pop()
            members.append(cur)
            for n in h3.grid_disk(cur.h3, 1):
                nc = hot.get(n)
                if nc is not None and n not in seen:
                    seen.add(n)
                    stack.append(nc)
        lsts = [m.lst_c for m in members if m.lst_c is not None]
        out.append(
            Cluster(
                cells=sorted(members, key=lambda m: m.h3),
                score=round(mean(m.score for m in members)),
                lst_c=round(mean(lsts), 1) if lsts else None,
            )
        )
    out.sort(key=lambda c: (-c.score, -len(c.cells), c.cells[0].h3))
    return out[: HEAT["max_zones"]]


def near_ties(scores: list[int], tol: int | None = None) -> list[bool]:
    tol = HEAT["near_tie"] if tol is None else tol
    n = len(scores)
    return [
        (i > 0 and abs(s - scores[i - 1]) <= tol) or (i < n - 1 and abs(s - scores[i + 1]) <= tol)
        for i, s in enumerate(scores)
    ]


def cells_centroid(cells: list[str]) -> tuple[float, float]:
    pts = [h3.cell_to_latlng(c) for c in cells]
    return mean(p[0] for p in pts), mean(p[1] for p in pts)


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def cells_area_km2(cells: Iterable[str]) -> float:
    return sum(h3.cell_area(c, unit="km^2") for c in cells)


def ring_outline(center_cell: str, k: int) -> list[list[list[float]]]:
    """Outline of the hex ring as GeoJSON polygon rings ([lng, lat])."""
    shape = h3.cells_to_h3shape(h3.grid_disk(center_cell, k))
    gj = shape.__geo_interface__
    if gj["type"] == "Polygon":
        return [list(map(list, ring)) for ring in gj["coordinates"]]
    # MultiPolygon: the ring is connected, so take the largest polygon
    polys = gj["coordinates"]
    best = max(polys, key=lambda p: len(p[0]))
    return [list(map(list, ring)) for ring in best]
