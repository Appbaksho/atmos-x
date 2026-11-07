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


SEEDERS: list = []


async def main() -> None:
    from app.models import PrecomputeRegion

    async with SessionLocal() as db:
        await upsert(db, PrecomputeRegion, REGIONS, ["id"])
        for fn in SEEDERS:
            await fn(db)
        await db.commit()
    print("seed: ok")


if __name__ == "__main__":
    asyncio.run(main())
