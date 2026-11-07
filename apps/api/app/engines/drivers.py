"""Drivers, causes, "why" and what-if for a zone (prompt-v1 §7.4, §7.5). Pure functions.

°C shares come from measured data: per composite, a least-squares fit of the day anomaly on sealed,
green, water and dark-surface shares across hexes. adds_c = coef × (value − regional mean). The fit
needs ≥ 500 hexes; otherwise V0's coefficients are used and labelled estimate. "why" only restates
numbers.

The land-cover shares nearly sum to 1, so plain OLS splits them arbitrarily (on Dhaka it gave
sealed surfaces a negative effect). The fit is therefore sign-constrained (sealed and dark surfaces
can only warm, green and water can only cool; exact NNLS over all subsets of the 4 drivers) with a
small ridge penalty on standardized drivers, so correlated drivers share the effect instead of one
taking all of it. RIDGE is a design choice; R² is published on /sources.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .heat import FALLBACK_COEFS, HEAT, heat_score

DRIVERS = ("sealed", "green", "water", "dark_surface")
MIN_FIT_HEXES = 500
UNITS = {"sealed": "share", "green": "share", "water": "share", "dark_surface": "share", "night": "°C"}


@dataclass
class Fit:
    coefs: dict[str, float]
    means: dict[str, float]
    intercept: float
    r2: float | None
    n: int
    label: str  # derived | estimate


def fit_drivers(rows: list[dict]) -> Fit:
    """rows: dicts with anom_day and the DRIVERS (None allowed; such rows are skipped)."""
    use = [r for r in rows if r.get("anom_day") is not None and all(r.get(d) is not None for d in DRIVERS)]
    if len(use) < MIN_FIT_HEXES:
        means = {d: float(np.mean([r[d] for r in use])) if use else 0.0 for d in DRIVERS}
        return Fit(dict(FALLBACK_COEFS), means, 0.0, None, len(use), "estimate")
    X = np.array([[r[d] for d in DRIVERS] for r in use], dtype=float)
    y = np.array([r["anom_day"] for r in use], dtype=float)
    means = {d: float(X[:, i].mean()) for i, d in enumerate(DRIVERS)}
    signs = np.array([SIGN[d] for d in DRIVERS], dtype=float)
    mu = X.mean(axis=0)
    sd = X.std(axis=0)
    sd[sd == 0] = 1.0
    Z = (X - mu) / sd * signs
    yc = y - y.mean()
    lam = RIDGE * len(y)
    Za = np.vstack([Z, np.sqrt(lam) * np.eye(Z.shape[1])])
    ya = np.concatenate([yc, np.zeros(Z.shape[1])])
    b_std, _, _ = _nnls_subsets(Za, ya, intercept=False)
    coef_raw = b_std * signs / sd
    pred = (X - mu) @ coef_raw + y.mean()
    ss_res = float(((y - pred) ** 2).sum())
    ss_tot = float(((y - y.mean()) ** 2).sum())
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else None
    intercept = float(y.mean() - mu @ coef_raw)
    coefs = {d: float(coef_raw[i]) for i, d in enumerate(DRIVERS)}
    return Fit(coefs, means, intercept, r2, len(use), "derived")


RIDGE = 0.25


# Expected direction of each driver: +1 warms, −1 cools.
SIGN = {"sealed": 1.0, "green": -1.0, "water": -1.0, "dark_surface": 1.0}


def _nnls_subsets(X: np.ndarray, y: np.ndarray, intercept: bool = True) -> tuple[np.ndarray, float, float]:
    """Least squares with coef ≥ 0, exact for a few columns: try every subset of active columns."""
    n, p = X.shape
    base = float(y.mean()) if intercept else 0.0
    best = (np.zeros(p), base, float(((y - base) ** 2).sum()))
    for mask in range(1, 1 << p):
        cols = [j for j in range(p) if mask >> j & 1]
        A = np.column_stack([X[:, cols], np.ones(n)]) if intercept else X[:, cols]
        sol, *_ = np.linalg.lstsq(A, y, rcond=None)
        k = len(cols)
        if np.any(sol[:k] < 0):
            continue
        sse = float(((y - A @ sol) ** 2).sum())
        if sse < best[2] - 1e-12:
            c = np.zeros(p)
            c[cols] = sol[:k]
            best = (c, float(sol[-1]) if intercept else 0.0, sse)
    return best


def contributions(values: dict[str, float | None], fit: Fit) -> list[dict]:
    out = []
    for d in DRIVERS:
        v = values.get(d)
        if v is None:
            continue
        adds = fit.coefs[d] * (v - fit.means.get(d, 0.0))
        out.append({"driver": d, "value": round(v, 3), "unit": UNITS[d], "adds_c": round(adds, 2)})
    return out


def other_c(anom_day: float | None, contribs: list[dict]) -> float | None:
    if anom_day is None:
        return None
    return round(anom_day - sum(c["adds_c"] for c in contribs), 2)


CAUSE_CODE = {
    "sealed": "cause.sealed_surface",
    "green": "cause.low_green",
    "dark_surface": "cause.dark_surfaces",
    "night": "cause.hot_nights",
    "buildings": "cause.dense_buildings",
    "roads": "cause.wide_roads",
    "pop": "cause.dense_population",
}


def causes(
    contribs: list[dict],
    *,
    anom_night: float | None = None,
    building_share: float | None = None,
    road_share: float | None = None,
) -> list[dict]:
    """Top 3 positive °C contributions as I18nText-like dicts. Water only ever cools, so never a cause."""
    cands: list[tuple[float, dict]] = []
    for c in contribs:
        if c["driver"] == "water" or c["adds_c"] < 0.1:
            continue
        pct = round(c["value"] * 100)
        if c["driver"] == "green":
            pct = round(c["value"] * 100)
        cands.append(
            (c["adds_c"], {"code": CAUSE_CODE[c["driver"]], "params": {"pct": pct, "adds_c": round(c["adds_c"], 1)}})
        )
    if anom_night is not None and anom_night >= 0.5:
        cands.append((anom_night * 0.5, {"code": CAUSE_CODE["night"], "params": {"delta_c": round(anom_night, 1)}}))
    if building_share is not None and building_share >= 0.45:
        cands.append(
            (
                0.05 + building_share * 0.1,
                {"code": CAUSE_CODE["buildings"], "params": {"pct": round(building_share * 100)}},
            )
        )
    if road_share is not None and road_share >= 0.15:
        cands.append(
            (0.05 + road_share * 0.1, {"code": CAUSE_CODE["roads"], "params": {"pct": round(road_share * 100)}})
        )
    cands.sort(key=lambda t: -t[0])
    return [c for _, c in cands[:3]]


def why(
    anom_day: float | None, contribs: list[dict], green: float | None, sealed: float | None, what_if_drop: float
) -> list[dict]:
    """2–3 deterministic sentences (I18nText) built from the same numbers the screen shows."""
    out: list[dict] = []
    if anom_day is not None:
        if anom_day >= 0.5:
            out.append({"code": "why.hotter", "params": {"delta_c": round(anom_day, 1)}})
        elif anom_day <= -0.5:
            out.append({"code": "why.cooler", "params": {"delta_c": round(-anom_day, 1)}})
        else:
            out.append({"code": "why.typical", "params": {}})
    top = sorted((c for c in contribs if c["driver"] != "water" and c["adds_c"] >= 0.1), key=lambda c: -c["adds_c"])[:2]
    if top:
        a = top[0]
        out.append(
            {
                "code": f"why.one.{a['driver']}",
                "params": {"pct": round(a["value"] * 100), "adds_c": round(a["adds_c"], 1)},
            }
        )
    if len(top) == 2:
        b = top[1]
        out.append(
            {
                "code": f"why.also.{b['driver']}",
                "params": {"pct": round(b["value"] * 100), "adds_c": round(b["adds_c"], 1)},
            }
        )
    if what_if_drop >= 0.05:
        out.append(
            {
                "code": "why.help.green",
                "params": {"add_pct": round(HEAT["what_if_green"] * 100), "drop_c": round(what_if_drop, 1)},
            }
        )
    elif sealed is not None and sealed >= 0.6:
        out.append({"code": "why.help.roofs", "params": {}})
    return out


def what_if_green(
    *,
    anom_day: float | None,
    anom_night: float | None,
    sealed: float | None,
    green: float | None,
    fit: Fit,
    add: float | None = None,
) -> dict:
    add = HEAT["what_if_green"] if add is None else add
    coef = fit.coefs.get("green", FALLBACK_COEFS["green"])
    drop = max(0.0, -coef * add)
    new_green = None if green is None else min(1.0, green + add)
    new_anom = None if anom_day is None else anom_day - drop
    res = heat_score(new_anom, anom_night, sealed, new_green)
    return {
        "add_green_pct": round(add * 100),
        "score_after": res.score if res else None,
        "lst_drop_c": round(drop, 2),
        "label": "estimate",
    }


def finite(v) -> float | None:
    if v is None:
        return None
    f = float(v)
    return f if math.isfinite(f) else None
