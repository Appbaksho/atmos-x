"""`make seed`: reference data, idempotent (upserts). Never seeds users, community or real companies.

Tables: precompute_regions, plus (as their features land) action types, species, cost tables,
point rules and badges. Values that the audit calls "proposed" are configuration rows.
"""

from __future__ import annotations

import asyncio

from sqlalchemy.dialects.postgresql import insert

from app.db import SessionLocal

REGIONS = [
    # §7.1 Dhaka precompute: south 23.69, west 90.33, north 23.90, east 90.50 (≈ 405 km², ≈ 26,900 hexes)
    {"id": "dhaka", "name": "Dhaka", "south": 23.69, "west": 90.33, "north": 23.90, "east": 90.50, "enabled": True},
]


async def upsert(db, model, rows: list[dict], key: list[str]) -> None:
    if not rows:
        return
    stmt = insert(model).values(rows)
    cols = {c: getattr(stmt.excluded, c) for c in rows[0] if c not in key}
    stmt = stmt.on_conflict_do_update(index_elements=key, set_=cols) if cols else stmt.on_conflict_do_nothing()
    await db.execute(stmt)


def species_rows() -> list[dict]:
    from app.data import catalog as C

    rows = []
    for i, (sid, en, bn, ur, sci, cat, canopy, lo, hi, listed) in enumerate(C.TREES):
        d = C.DETAIL.get(sid, {})
        price = d.get("price", (lo, hi))
        rows.append(
            {
                "id": sid,
                "name": {"en": en, "bn": bn, "ur": ur},
                "local_name": bn,
                "scientific": sci,
                "emoji": C.EMOJI[cat],
                "kind": "tree",
                "canopy_m": canopy,
                "cooling": "high" if canopy >= 12 else ("medium" if canopy >= 8 else "low"),
                "water": d.get("water", "medium" if cat == "r" else "low"),
                "price_amount": C.mid_price(*price),
                "price_currency": "BDT",
                "planting_season": "monsoon",
                "growth": d.get("growth", "medium"),
                "notes": [{"code": f"species.care.{d.get('care', 'tree')}.{n}"} for n in range(1, 5)],
                "native_regions": ["South Asia"],
                "countries": ["BD"],
                "climate_bands": ["tropical_wet", "tropical_dry"],
                "image_url": d.get("img", C.img(C.NEEM_IMG, 600, 500, "&crop=focalpoint&fp-x=.5&fp-y=.5&fp-z=1.4")),
                "source": "atmos_reference",
                "estimate": listed == 0,
                "position": i,
            }
        )
    m = C.MADHABILATA
    rows.append(
        {
            "id": m["id"], "name": {"en": m["en"], "bn": m["bn"], "ur": m["ur"]}, "local_name": m["bn"], "scientific": m["sci"], "emoji": "🌿",
            "kind": "climber", "canopy_m": m["canopy"], "cooling": "low", "water": m["water"], "price_amount": C.mid_price(*m["price"]),
            "price_currency": "BDT", "planting_season": "monsoon", "growth": m["growth"],
            "notes": [{"code": f"species.care.climber.{n}"} for n in range(1, 5)], "native_regions": ["South Asia"], "countries": ["BD"],
            "climate_bands": ["tropical_wet", "tropical_dry"], "image_url": m["img"], "source": "atmos_reference", "estimate": False, "position": len(rows),
        }
    )  # fmt: skip
    pos = 100
    for band, items in C.INTL.items():
        for sid, en, sci, canopy, water in items:
            rows.append(
                {
                    "id": sid, "name": {"en": en}, "local_name": None, "scientific": sci, "emoji": "🌳", "kind": "tree", "canopy_m": canopy,
                    "cooling": "high" if canopy >= 12 else ("medium" if canopy >= 8 else "low"), "water": water, "price_amount": None,
                    "price_currency": None, "planting_season": "local", "growth": "medium", "notes": [{"code": "species.intl.check_nursery"}],
                    "native_regions": [], "countries": [], "climate_bands": [band], "image_url": None, "source": "atmos_reference", "estimate": True, "position": pos,
                }
            )  # fmt: skip
            pos += 1
    return rows


async def main() -> None:
    from app.data import catalog as C
    from app.models import ActionType, Badge, CostTable, PointRule, PrecomputeRegion, Species

    async with SessionLocal() as db:
        await upsert(db, PrecomputeRegion, REGIONS, ["id"])
        await upsert(
            db,
            ActionType,
            [
                {
                    "id": a[0],
                    "title_code": a[1],
                    "unit_code": a[2],
                    "points": a[3],
                    "points_per": a[4],
                    "cooling_per_unit": a[5],
                    "cooling_unit_size": a[6] or 1,
                    "is_tree": a[7],
                    "is_ground": a[8],
                    "content_check": a[9],
                    "emoji": a[10],
                    "daily_limit": a[11],
                    "position": i,
                }
                for i, a in enumerate(C.ACTION_TYPES)
            ],
            ["id"],
        )
        await upsert(
            db,
            PointRule,
            [{"id": r[0], "description": r[1], "points": r[2], "per": r[3], "unlock": r[4]} for r in C.POINT_RULES],
            ["id"],
        )
        await upsert(
            db,
            Badge,
            [{"id": b[0], "emoji": b[1], "code": b[2], "rule": b[3], "position": i} for i, b in enumerate(C.BADGES)],
            ["id"],
        )
        await upsert(
            db,
            CostTable,
            [
                {"country": c[0], "item": c[1], "unit_cost": c[2], "currency": c[3], "unit": c[4], "source": c[5]}
                for c in C.COSTS
            ],
            ["country", "item"],
        )
        await upsert(db, Species, species_rows(), ["id"])
        await db.commit()
    print("seed: ok")


if __name__ == "__main__":
    asyncio.run(main())
