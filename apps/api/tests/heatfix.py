"""Synthetic heat cells for tests (no network): a hot built core with a cool park edge."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import h3

from app.engines import heat as H
from app.models import Composite, HeatCell

DHAKA = (23.759, 90.359)


async def seed_cells(db, center=DHAKA, k=4, hot_k=1, offset=(0, 0)) -> list[str]:
    c0 = h3.latlng_to_cell(center[0], center[1], 10)
    ring = h3.grid_disk(c0, k)
    hot = set(h3.grid_disk(c0, hot_k))
    hot2_center = h3.grid_disk(c0, 3)
    hot2 = set(h3.grid_disk(sorted(set(hot2_center) - set(h3.grid_disk(c0, 2)))[0], 0))
    comp = Composite(
        id=uuid.uuid4(), area_kind="chunk", area_key="test", pipeline_version="heat-v1.0", method="landsat",
        lst_from=date(2026, 9, 1), lst_to=date(2026, 11, 2), lst_scenes=[{"date": "2026-11-02"}], window_days=120,
        ndvi_date=date(2026, 10, 27), worldcover_year=2021, night_source="modis", night_to=date(2026, 10, 16),
        baseline_lst_c=35.0, cell_count=len(ring), satellite_cells=len(ring),
    )  # fmt: skip
    db.add(comp)
    await db.flush()
    for c in ring:
        lat, lng = h3.cell_to_latlng(c)
        is_hot = c in hot or c in hot2
        sealed, green = (0.95, 0.02) if is_hot else (0.5, 0.35)
        anom = 3.0 if is_hot else -0.5
        res = H.heat_score(anom, 0.5 if is_hot else 0.0, sealed, green)
        db.add(
            HeatCell(
                h3=c, chunk=h3.cell_to_parent(c, 7), composite_id=comp.id, lat=lat, lng=lng, label="satellite", score=res.score,
                lst_c=35.0 + anom, anom_day=anom, landsat_anom=anom, night_lst_c=26.0, anom_night=0.5 if is_hot else 0.0,
                sealed=sealed, green=green, water=0.0, tree=green, ndvi=0.2 if is_hot else 0.5, dark_surface=0.8,
                valid_px=16, n_obs=4, terms=res.terms + ["lst:landsat"], updated_at=datetime.now(UTC),
            )
        )  # fmt: skip
    await db.commit()
    return ring
