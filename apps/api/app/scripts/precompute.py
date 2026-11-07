"""`make precompute`: run the region heat precompute now, in this process (normally the worker's job)."""

from __future__ import annotations

import argparse
import asyncio

from app import logs
from app.db import SessionLocal
from app.models import PrecomputeRegion
from app.services import heat_pipeline as hp
from app.services.conditions_now import today_tmax


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="dhaka")
    args = ap.parse_args()
    logs.setup("INFO")
    async with SessionLocal() as db:
        reg = await db.get(PrecomputeRegion, args.region)
        if reg is None:
            raise SystemExit(f"unknown region {args.region}; run make seed")
        cells = hp.region_cells(reg.south, reg.west, reg.north, reg.east)
        print(f"{reg.name}: {len(cells)} hexes")
        tmax = await today_tmax(db, (reg.south + reg.north) / 2, (reg.west + reg.east) / 2)
        r = await hp.compute_area(db, area_kind="region", area_key=reg.id, cells=cells, tmax_c=tmax)
        from datetime import UTC, datetime

        reg.last_run_at = datetime.now(UTC)
        reg.last_status = f"ok: {r.satellite} satellite / {r.cells}"
        await db.commit()
        print(f"done: {r.satellite} satellite, {r.estimate} estimate, {r.no_data} no data; timings {r.timings}")


if __name__ == "__main__":
    asyncio.run(main())
