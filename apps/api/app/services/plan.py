"""Plans, feasibility, budget and species (prompt-v1 §6.6, §7.10). Deterministic; no language model.

Space comes from the zone's stored planting spots (clipped to the polygon). The recommended target
comes from that space and the timeline (trees ramp over 8 years). Under 3 years the goal is stated in
actions. Costs come from `cost_tables` (reference); species from the curated table, ranked by canopy
and water fit to the zone's drivers; outside Bangladesh, a small climate-band list labelled
"commonly planted, check with a local nursery".
"""

from __future__ import annotations

import math
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..engines import cooling as CO
from ..engines.weather import in_bangladesh
from ..models import CostTable, PlantingSpots, ScanZone, Species
from ..sources import SRC
from . import cache, geo, jobs
from .conditions import normal_key

WATER_FIT = {"low": 1.0, "medium": 0.65, "high": 0.3}


def years_until(by_date: date, today: date | None = None) -> float:
    today = today or datetime.now(UTC).date()
    return max(0.0, (by_date - today).days / 365.25)


async def zone_space(db: AsyncSession, z: ScanZone) -> tuple[dict | None, str]:
    row = await db.get(PlantingSpots, z.id)
    if row is None or row.status != "ready":
        await jobs.enqueue(db, "planting_spots", z.id, {"zone_id": z.id}, priority=6, max_attempts=4)
        await db.commit()
        return None, "pending"
    return dict(row.totals), "ready"


async def costs_for(db: AsyncSession, country: str | None) -> dict:
    rows = (
        (await db.execute(select(CostTable).where(CostTable.country.in_([country or "default", "default"]))))
        .scalars()
        .all()
    )
    out: dict[str, tuple[float, str]] = {}
    for r in sorted(rows, key=lambda r: r.country == "default"):  # country rows win
        out.setdefault(r.item, (r.unit_cost, r.currency))
    return out


async def climate_band(db: AsyncSession, lat: float, lng: float) -> str:
    """From the cached NASA POWER normal: mean daily Tmax and annual rain (§7.10 bands)."""
    hit = await cache.peek(db, normal_key(lat, lng))
    normals = (hit.value if hit else {}).get("normals", {})
    rain = (hit.value if hit else {}).get("annual_rain_mm")
    tmax = sum(normals.values()) / len(normals) if normals else (30 - abs(lat) * 0.35)
    if tmax >= 27:
        if rain is None:
            return "tropical_wet" if abs(lat) < 23.5 else "tropical_dry"
        return "tropical_wet" if rain >= 1000 else ("tropical_dry" if rain >= 400 else "arid")
    if tmax >= 15:
        return "arid" if rain is not None and rain < 300 else "temperate"
    return "cold"


def species_out(s: Species, lang: str, rank_score: float | None = None) -> dict:
    name = s.name.get(lang) or s.name.get("en") or s.id
    return {
        "id": s.id,
        "name": name,
        "local_name": s.local_name if lang != "bn" else s.name.get("en"),
        "scientific": s.scientific,
        "emoji": s.emoji,
        "canopy_m": s.canopy_m,
        "cooling": s.cooling,
        "water": s.water,
        "price": {"amount": s.price_amount, "currency": s.price_currency} if s.price_amount else None,
        "image_url": s.image_url,
        "kind": s.kind,
        "estimate": s.estimate,
        "commonly_planted": not s.countries,
        **({"fit": round(rank_score, 2)} if rank_score is not None else {}),
    }


def species_detail(s: Species, lang: str) -> dict:
    return {
        **species_out(s, lang),
        "planting_season": s.planting_season,
        "growth": s.growth,
        "notes": s.notes,
        "native_regions": s.native_regions,
        "cooling_c_at_maturity": round(s.canopy_m * 0.0025, 3),
    }


def rank(sp: list[Species], drivers: dict | None) -> list[tuple[Species, float]]:
    """Canopy and water fit to the zone: sealed, treeless blocks need wide shade that copes with dry spells."""
    sealed = ((drivers or {}).get("sealed_pct") or 60) / 100
    canopy_w = 0.5 + 0.3 * sealed
    out = []
    for s in sp:
        canopy = min(1.0, s.canopy_m / 20)
        score = canopy_w * canopy + (1 - canopy_w) * WATER_FIT.get(s.water, 0.5)
        if s.kind == "climber":
            score *= 0.6
        out.append((s, score))
    return sorted(out, key=lambda t: (-t[1], t[0].position))


async def species_list(
    db: AsyncSession, lat: float | None, lng: float | None, lang: str, drivers: dict | None = None
) -> dict:
    bd = lat is None or in_bangladesh(lat, lng or 0)
    if bd:
        rows = (
            (await db.execute(select(Species).where(Species.countries.contains(["BD"])).order_by(Species.position)))
            .scalars()
            .all()
        )
        band = "tropical_wet"
    else:
        band = await climate_band(db, lat, lng)
        rows = (
            (
                await db.execute(
                    select(Species)
                    .where(Species.climate_bands.contains([band]), Species.countries == [])
                    .order_by(Species.position)
                )
            )
            .scalars()
            .all()
        )
    ranked = rank(list(rows), drivers)
    return {
        "species": [species_out(s, lang, sc) for s, sc in ranked],
        "region": "BD" if bd else band,
        "meta": {
            "live": True,
            "stale": False,
            "generated_at": datetime.now(UTC).isoformat(),
            "sources": [SRC["atmos_reference"].src(kind="reference").model_dump()],
        },
    }


def mix_actions(mix: dict, area_km2: float, costs: dict) -> tuple[list[dict], dict]:
    cur = costs.get("tree", (0, "BDT"))[1]
    tree_cost = costs.get("tree", (0, cur))[0]
    roof_cost = costs.get("roof_m2", (0, cur))[0]
    shade_cost = costs.get("shade", (0, cur))[0]
    care = costs.get("care_tree_year", (0, cur))[0]
    water = costs.get("water_l_week_tree", (20, "L"))[0]
    acts = [
        {
            "action_type": "plant_tree",
            "qty": mix["trees"],
            "cooling_c": round(mix["trees"] * CO.tree_c(area_km2), 2),
            "cost": {"amount": round(mix["trees"] * tree_cost), "currency": cur},
            "water_l_week": round(mix["trees"] * water),
            "effort": "high" if mix["trees"] > 150 else "medium",
            "why": {"code": "plan.why.plant_tree", "params": {"trees": mix["trees"]}},
            "estimate": True,
        },
        {
            "action_type": "cool_roof",
            "qty": math.ceil(mix["roof_m2"] / 10),
            "cooling_c": round(mix["roof_m2"] * CO.roof_c(area_km2), 2),
            "cost": {"amount": round(mix["roof_m2"] * roof_cost), "currency": cur},
            "water_l_week": 0,
            "effort": "medium",
            "why": {"code": "plan.why.cool_roof", "params": {"roof_m2": mix["roof_m2"]}},
            "estimate": True,
        },
        {
            "action_type": "shade_structure",
            "qty": mix["shade"],
            "cooling_c": round(mix["shade"] * CO.shade_c(area_km2), 2),
            "cost": {"amount": round(mix["shade"] * shade_cost), "currency": cur},
            "water_l_week": 0,
            "effort": "low",
            "why": {"code": "plan.why.shade_structure", "params": {"shade": mix["shade"]}},
            "estimate": True,
        },
        {
            "action_type": "awareness",
            "qty": 1,
            "cooling_c": 0,
            "cost": {"amount": 0, "currency": cur},
            "water_l_week": 0,
            "effort": "low",
            "why": {"code": "plan.why.awareness"},
        },
    ]
    acts = [a for a in acts if a["qty"] > 0]
    acts.sort(key=lambda a: -(a["cooling_c"] / max(1, a["cost"]["amount"])) if a["cooling_c"] else 1)
    lines = [
        {
            "label": {"code": "budget.trees"},
            "qty": mix["trees"],
            "unit_cost": {"amount": tree_cost, "currency": cur},
            "total": {"amount": round(mix["trees"] * tree_cost), "currency": cur},
            "estimate": True,
        },
        {
            "label": {"code": "budget.cool_roof"},
            "qty": mix["roof_m2"],
            "unit_cost": {"amount": roof_cost, "currency": cur},
            "total": {"amount": round(mix["roof_m2"] * roof_cost), "currency": cur},
            "estimate": True,
        },
        {
            "label": {"code": "budget.shade"},
            "qty": mix["shade"],
            "unit_cost": {"amount": shade_cost, "currency": cur},
            "total": {"amount": round(mix["shade"] * shade_cost), "currency": cur},
            "estimate": True,
        },
    ]
    lines = [ln for ln in lines if ln["qty"] > 0]
    budget = {
        "lines": lines,
        "total": {"amount": sum(ln["total"]["amount"] for ln in lines), "currency": cur},
        "water_l_week": round(mix["trees"] * water),
        "care_per_year": {"amount": round(mix["trees"] * care), "currency": cur},
    }
    return acts, budget


def steps(mix: dict, kind: str) -> list[dict]:
    out = [{"title": {"code": "plan.step.map.title"}, "detail": {"code": "plan.step.map.detail"}}]
    if mix["trees"]:
        out.append(
            {
                "title": {"code": "plan.step.plant.title", "params": {"trees": mix["trees"]}},
                "detail": {"code": "plan.step.plant.detail"},
            }
        )
    if mix["roof_m2"]:
        out.append(
            {
                "title": {"code": "plan.step.roofs.title", "params": {"roof_m2": mix["roof_m2"]}},
                "detail": {"code": "plan.step.roofs.detail"},
            }
        )
    out.append({"title": {"code": "plan.step.team.title"}, "detail": {"code": "plan.step.team.detail"}})
    out.append({"title": {"code": "plan.step.care.title"}, "detail": {"code": "plan.step.care.detail"}})
    if kind == "action":
        out.append({"title": {"code": "plan.step.long_term.title"}, "detail": {"code": "plan.step.long_term.detail"}})
    return out


def care_plan(month: int) -> list[dict]:
    dry = month in (11, 12, 1, 2, 3, 4)
    return [
        {"code": "plan.care.year1"},
        {"code": "plan.care.dry" if dry else "plan.care.monsoon"},
        {"code": "plan.care.checkin"},
        {"code": "plan.care.year2"},
    ]


def next_task(mix: dict) -> dict | None:
    if mix["trees"]:
        return {
            "action_type": "plant_tree",
            "text": {"code": "plan.next.plant", "params": {"n": min(10, mix["trees"])}},
        }
    if mix["roof_m2"]:
        return {
            "action_type": "cool_roof",
            "text": {"code": "plan.next.roof", "params": {"m2": min(100, mix["roof_m2"])}},
        }
    return {"action_type": "awareness", "text": {"code": "plan.next.awareness"}}


async def feasibility_for(db: AsyncSession, z: ScanZone, target_c: float, by_date: date) -> dict:
    space, status = await zone_space(db, z)
    yrs = years_until(by_date)
    f = CO.feasibility(target_c, z.area_km2, space, yrs)
    f["spots_status"] = status
    f["years"] = round(yrs, 2)
    f["area_km2"] = z.area_km2
    return f


async def build_plan(
    db: AsyncSession, z: ScanZone, target_c: float, by_date: date, lang: str, goal_id: str | None = None
) -> dict:
    f = await feasibility_for(db, z, target_c, by_date)
    cc = await geo.country_code(db, z.centroid_lat, z.centroid_lng)
    costs = await costs_for(db, "BD" if cc == "BD" else cc)
    acts, budget = mix_actions(f["mix"], z.area_km2, costs)
    sp = await species_list(db, z.centroid_lat, z.centroid_lng, lang, z.drivers)
    sources = [SRC["atmos_reference"].src(kind="reference").model_dump()]
    if f["spots_status"] == "ready":
        sources.append(SRC["osm"].src(kind="reference").model_dump())
    feas = {
        k: f[k]
        for k in (
            "feasible",
            "needed",
            "capacity",
            "spots_available",
            "achievable_c",
            "recommended_target_c",
            "kind",
            "notes",
            "spots_status",
            "years",
        )
    }
    return {
        "goal_id": goal_id,
        "zone_id": z.id,
        "feasibility": feas,
        "actions": acts,
        "species": sp["species"][:5],
        "species_total": len(sp["species"]),
        "steps": steps(f["mix"], f["kind"]),
        "next_task": next_task(f["mix"]),
        "budget": budget,
        "care_plan": care_plan(datetime.now(UTC).month),
        "meta": {
            "live": f["spots_status"] == "ready",
            "stale": False,
            "generated_at": datetime.now(UTC).isoformat(),
            "sources": sources,
        },
    }


def default_by_date(months: int) -> date:
    return (datetime.now(UTC) + timedelta(days=round(months * 30.44))).date()
