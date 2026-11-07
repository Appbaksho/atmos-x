"""Scans and zones (prompt-v1 §7.1 'Scan flow', §7.3 one-object rule, §6.4, §6.5).

GET /zones never calls a satellite source: it reads `heat_cells` for the hex ring. Missing cells
enqueue deduplicated chunk jobs and the scan returns `partial` at once. Zones are clustered from the
present cells and stored as immutable `scan_zones` rows; `(center_cell, k, composite_key)` is unique,
so everyone in that cell shares a scan, and GET /zones/{id} only ever reads the row.
"""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import UTC, datetime, timedelta

import h3
from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import PIPELINE_VERSION
from ..engines import drivers as D
from ..engines import heat as H
from ..errors import guest_restricted, not_found
from ..models import Composite, DriverCoefficients, HeatCell, Job, Scan, ScanZone
from ..ratelimit import limit
from ..sources import SRC
from . import geo, jobs

log = logging.getLogger("atmos.scan")

CHUNK_JOB = "heat_chunk"
NAME_JOB = "name_zones"
COLD_LIMIT = {"user": 30, "guest": 10}


def zone_id(scan_id: uuid.UUID, rank: int) -> str:
    return f"z_{scan_id.hex[:8]}_{rank}"


def chunk_job_key(chunk: str) -> str:
    return f"{chunk}:{PIPELINE_VERSION}"


def _pick_chunks(missing_chunks: dict[str, int]) -> list[str]:
    """Greedy cover: each chunk job also computes its k=1 neighbours."""
    left = dict(missing_chunks)
    picked: list[str] = []
    while left:
        c = max(left, key=lambda k: left[k])
        picked.append(c)
        for nb in h3.grid_disk(c, 1):
            left.pop(nb, None)
    return picked


async def _fit_for(db: AsyncSession, composite_id: uuid.UUID) -> D.Fit:
    row = (
        await db.execute(
            select(DriverCoefficients)
            .where(DriverCoefficients.composite_id == composite_id)
            .order_by(DriverCoefficients.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row:
        return D.Fit(row.coefs, row.means, row.coefs.get("_intercept", 0.0), row.r2, row.n, row.label)
    rows = (
        (
            await db.execute(
                text(
                    "SELECT anom_day, sealed, green, water, dark_surface FROM heat_cells WHERE composite_id = :c AND label = 'satellite'"
                ),
                {"c": composite_id},
            )
        )
        .mappings()
        .all()
    )
    fit = D.fit_drivers([dict(r) for r in rows])
    comp = await db.get(Composite, composite_id)
    db.add(
        DriverCoefficients(
            area_key=comp.area_key if comp else "?",
            composite_id=composite_id,
            coefs={**fit.coefs, "_intercept": fit.intercept},
            means=fit.means,
            r2=fit.r2,
            n=fit.n,
            label=fit.label,
        )
    )
    await db.flush()
    return fit


def _mean(vals: list[float | None]) -> float | None:
    v = [x for x in vals if x is not None]
    return sum(v) / len(v) if v else None


def zone_name(z: ScanZone, lang: str) -> tuple[str, dict | None]:
    m = z.name or {}
    for k in (lang, "default", "en"):
        if m.get(k):
            return m[k], None
    return "", {"code": "zone.unnamed", "params": {"n": z.rank}}


def summary(z: ScanZone, lang: str) -> dict:
    name, name_text = zone_name(z, lang)
    return {
        "id": z.id,
        "scan_id": str(z.scan_id),
        "name": name,
        "name_text": name_text,
        "score": z.score,
        "lst_c": z.lst_c,
        "label": z.label,
        "dist_m": z.dist_m,
        "rank": z.rank,
        "near_tie": z.near_tie,
        "centroid": {"lat": z.centroid_lat, "lng": z.centroid_lng},
        "h3": list(z.h3),
        "area_km2": z.area_km2,
        "drivers": z.drivers,
    }


def _sources(acq: dict, method: str) -> list[dict]:
    out = []
    if acq.get("lst_scenes"):
        out.append(SRC["landsat"].src(as_of=acq.get("lst_to"), kind="observation").model_dump())
    if method == "modis" or acq.get("modis_cells"):
        out.append(
            SRC["modis_lst"].src(as_of=acq.get("night_to") or acq.get("lst_to"), kind="observation").model_dump()
        )
    if acq.get("worldcover_year"):
        out.append(SRC["worldcover"].src(as_of=str(acq["worldcover_year"]), kind="observation").model_dump())
    if acq.get("ndvi_date"):
        out.append(SRC["hls"].src(as_of=acq["ndvi_date"], kind="observation").model_dump())
    if acq.get("night_source") == "modis":
        out.append(SRC["modis_lst"].src(as_of=acq.get("night_to"), kind="observation").model_dump())
    if acq.get("ecostress_passes"):
        out.append(SRC["ecostress"].src(kind="observation").model_dump())
    out.append(SRC["atmos"].src(kind="derived").model_dump())
    seen, uniq = set(), []
    for s in out:
        if s["id"] in seen:
            continue
        seen.add(s["id"])
        uniq.append(s)
    return uniq


async def _acquired(db: AsyncSession, composite_ids: list[uuid.UUID]) -> tuple[dict, float | None, str]:
    if not composite_ids:
        return (
            {
                "lst_from": None,
                "lst_to": None,
                "lst_scenes": 0,
                "ndvi_date": None,
                "worldcover_year": None,
                "ecostress_passes": 0,
            },
            None,
            "landcover",
        )
    comps = (await db.execute(select(Composite).where(Composite.id.in_(composite_ids)))).scalars().all()
    lst_from = min((c.lst_from for c in comps if c.lst_from), default=None)
    lst_to = max((c.lst_to for c in comps if c.lst_to), default=None)
    ndvi = max((c.ndvi_date for c in comps if c.ndvi_date), default=None)
    night_to = max((c.night_to for c in comps if c.night_to), default=None)
    scenes = max((len(c.lst_scenes or []) for c in comps), default=0)
    methods = {c.method for c in comps}
    method = "landsat" if "landsat" in methods else ("modis" if "modis" in methods else "landcover")
    main = max(comps, key=lambda c: c.cell_count)
    acq = {
        "lst_from": lst_from.isoformat() if lst_from else None,
        "lst_to": lst_to.isoformat() if lst_to else None,
        "lst_scenes": scenes,
        "ndvi_date": ndvi.isoformat() if ndvi else None,
        "worldcover_year": max((c.worldcover_year for c in comps if c.worldcover_year), default=None),
        "ecostress_passes": max((c.ecostress_passes for c in comps), default=0),
        "night_source": main.night_source,
        "night_to": night_to.isoformat() if night_to else None,
        "window_days": main.window_days,
        "modis_cells": sum(int((c.stats or {}).get("modis_cells", 0)) for c in comps),
    }
    return acq, main.baseline_lst_c, method


async def _enqueue_missing(db: AsyncSession, missing: list[str], viewer) -> tuple[uuid.UUID | None, bool]:
    """Queue chunk jobs. Returns (job id to poll, unavailable)."""
    counts: dict[str, int] = {}
    for c in missing:
        p = h3.cell_to_parent(c, H.CHUNK_RES)
        counts[p] = counts.get(p, 0) + 1
    chunks = _pick_chunks(counts)
    # A recently failed job for every chunk means the sources are down: report 'unavailable'.
    failed = (
        (
            await db.execute(
                select(Job.key).where(
                    Job.kind == CHUNK_JOB,
                    Job.status == "failed",
                    Job.finished_at > datetime.now(UTC) - timedelta(hours=1),
                )
            )
        )
        .scalars()
        .all()
    )
    if failed and all(chunk_job_key(c) in set(failed) for c in chunks):
        return None, True
    active = (
        (
            await db.execute(
                select(Job.key).where(
                    Job.kind == CHUNK_JOB,
                    Job.status.in_(("queued", "running")),
                    Job.key.in_([chunk_job_key(c) for c in chunks]),
                )
            )
        )
        .scalars()
        .all()
    )
    if len(active) < len(chunks) and viewer is not None:
        tier = "guest" if viewer.is_guest else "user"
        await limit(db, f"coldscan:{viewer.rate_key}", COLD_LIMIT[tier], 3600, code="scan.rate_limited")
    first: uuid.UUID | None = None
    for c in chunks:
        jid = await jobs.enqueue(
            db, CHUNK_JOB, chunk_job_key(c), {"chunk": c, "ring": 1}, priority=3, total_cells=343 * 7
        )
        first = first or jid
    await db.commit()
    return first, False


async def get_scan(db: AsyncSession, viewer, lat: float, lng: float, radius_m: int, lang: str) -> dict:
    if viewer is not None and viewer.is_guest and radius_m > H.GUEST_MAX_RADIUS_M:
        raise guest_restricted()
    radius_m = max(100, min(1000, int(radius_m)))
    center = h3.latlng_to_cell(lat, lng, H.H3_RES)
    k = H.k_for_radius(radius_m)
    ring = h3.grid_disk(center, k)
    rows = (await db.execute(select(HeatCell).where(HeatCell.h3.in_(ring)))).scalars().all()
    by = {r.h3: r for r in rows}
    missing = sorted(c for c in ring if c not in by)
    comp_ids = sorted({r.composite_id for r in rows}, key=str)
    key_src = ",".join(str(c) for c in comp_ids) + "|" + PIPELINE_VERSION
    if missing:
        key_src += "|partial:" + hashlib.sha1(",".join(missing).encode()).hexdigest()[:10]
    composite_key = hashlib.sha1(key_src.encode()).hexdigest()[:40]

    job_id: uuid.UUID | None = None
    status = "complete"
    if missing:
        job_id, unavailable = await _enqueue_missing(db, missing, viewer)
        status = "unavailable" if unavailable and not rows else "partial"

    existing = (
        await db.execute(
            select(Scan).where(Scan.center_cell == center, Scan.k == k, Scan.composite_key == composite_key)
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = await _build(db, center, k, radius_m, composite_key, status, rows, missing, comp_ids, lang, job_id)
    else:
        await db.execute(
            update(Scan)
            .where(Scan.id == existing.id)
            .values(last_used_at=datetime.now(UTC), status=status, job_id=job_id)
        )
        await db.commit()
        existing.status, existing.job_id = status, job_id
    return await _scan_out(db, existing, lang)


async def _build(db, center, k, radius_m, composite_key, status, rows, missing, comp_ids, lang, job_id) -> Scan:
    clat, clng = h3.cell_to_latlng(center)
    acq, baseline, method = await _acquired(db, comp_ids)
    place = await geo.reverse(db, clat, clng, lang, timeout=2.0)
    hexes = [{"h3": r.h3, "score": r.score, "lst_c": r.lst_c, "label": r.label} for r in rows] + [
        {"h3": c, "score": None, "lst_c": None, "label": "no_data"} for c in missing
    ]
    scan = Scan(
        id=uuid.uuid4(),
        center_cell=center,
        k=k,
        radius_m=radius_m,
        composite_key=composite_key,
        pipeline_version=PIPELINE_VERSION,
        status=status,
        center_lat=clat,
        center_lng=clng,
        place={lang: place["place"], "_country": place.get("country_code")},
        acquired=acq,
        baseline_lst_c=baseline,
        method=method,
        hexes=hexes,
        sources=_sources(acq, method),
        job_id=job_id,
    )
    db.add(scan)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        found = (
            await db.execute(
                select(Scan).where(Scan.center_cell == center, Scan.k == k, Scan.composite_key == composite_key)
            )
        ).scalar_one()
        return found

    cells = [
        H.Cell(h3=r.h3, score=r.score, lst_c=r.lst_c, label=r.label, water=r.water) for r in rows if r.score is not None
    ]
    clusters = H.cluster_hot_cells(cells)
    ties = H.near_ties([c.score for c in clusters])
    fits: dict[uuid.UUID, D.Fit] = {}
    by = {r.h3: r for r in rows}
    unnamed = False
    for rank, (cl, tie) in enumerate(zip(clusters, ties, strict=True), start=1):
        members = [by[c.h3] for c in cl.cells]
        cid = max({m.composite_id for m in members}, key=lambda x: sum(1 for m in members if m.composite_id == x))
        if cid not in fits:
            fits[cid] = await _fit_for(db, cid)
        fit = fits[cid]
        zlat, zlng = H.cells_centroid([m.h3 for m in members])
        vals = {d: _mean([getattr(m, d) for m in members]) for d in D.DRIVERS}
        anom_day = _mean([m.anom_day for m in members])
        anom_night = _mean([m.anom_night for m in members])
        contribs = D.contributions(vals, fit)
        wi = D.what_if_green(
            anom_day=anom_day, anom_night=anom_night, sealed=vals["sealed"], green=vals["green"], fit=fit
        )
        sat_share = sum(1 for m in members if m.label == "satellite") / len(members)
        estimated = [] if fit.label == "derived" else ["contributions"]
        if any("lst:landcover" in (m.terms or []) for m in members):
            estimated.append("lst_c")
        drivers = {
            "sealed_pct": _pct(vals["sealed"]),
            "green_pct": _pct(vals["green"]),
            "water_pct": _pct(vals["water"]),
            "ndvi": _round(_mean([m.ndvi for m in members]), 2),
            "dark_roof_pct": _pct(vals["dark_surface"]),
            "pop_density_km2": None,
            "night_lst_c": _round(_mean([m.night_lst_c for m in members]), 1),
            "estimated": estimated,
            "contributions": contribs,
            "other_c": D.other_c(anom_day, contribs),
            "anom_day_c": _round(anom_day, 2),
            "anom_night_c": _round(anom_night, 2),
            "fit": {"r2": _round(fit.r2, 2), "n": fit.n, "label": fit.label},
            "as_of": acq.get("lst_to"),
        }
        label_row = await _stored_label(db, zlat, zlng, lang)
        if not label_row:
            unnamed = True
        z = ScanZone(
            id=zone_id(scan.id, rank),
            scan_id=scan.id,
            rank=rank,
            name=label_row,
            score=cl.score,
            lst_c=cl.lst_c,
            label="satellite" if sat_share >= 0.5 else "estimate",
            dist_m=round(H.haversine_m(clat, clng, zlat, zlng)),
            near_tie=tie,
            centroid_lat=round(zlat, 6),
            centroid_lng=round(zlng, 6),
            h3=[m.h3 for m in members],
            chunk=h3.cell_to_parent(members[0].h3, H.CHUNK_RES),
            drivers=drivers,
            causes=D.causes(
                contribs,
                anom_night=anom_night,
                building_share=_mean([m.building_share for m in members]),
                road_share=_mean([m.road_share for m in members]),
            ),
            why=D.why(anom_day, contribs, vals["green"], vals["sealed"], wi["lst_drop_c"]),
            what_if=wi,
            area_km2=round(H.cells_area_km2(m.h3 for m in members), 4),
            stats={"cells": len(members), "satellite_share": round(sat_share, 2), "composite_id": str(cid)},
        )
        db.add(z)
    await db.commit()
    if unnamed and clusters:
        await jobs.enqueue(db, NAME_JOB, str(scan.id), {"scan_id": str(scan.id), "lang": lang}, priority=6)
        await db.commit()
    return scan


async def _stored_label(db: AsyncSession, lat: float, lng: float, lang: str) -> dict | None:
    """Zone name from the place-label cache only (the request path never waits for Nominatim)."""
    key = h3.latlng_to_cell(lat, lng, 9)
    rows = (
        await db.execute(text("SELECT lang, label FROM place_labels WHERE key = :k AND source = 'zone'"), {"k": key})
    ).all()
    if not rows:
        return None
    m = {r[0]: r[1] for r in rows}
    m.setdefault("default", m.get("en") or next(iter(m.values())))
    return m


def _pct(v: float | None) -> int | None:
    return None if v is None else round(v * 100)


def _round(v: float | None, nd: int) -> float | None:
    return None if v is None else round(v, nd)


async def _scan_out(db: AsyncSession, scan: Scan, lang: str) -> dict:
    zones = (
        (await db.execute(select(ScanZone).where(ScanZone.scan_id == scan.id).order_by(ScanZone.rank))).scalars().all()
    )
    my = None
    for z in zones:
        if scan.center_cell in z.h3:
            my = z.id
            break
    if my is None and zones:
        my = min(zones, key=lambda z: z.dist_m).id
    place = scan.place.get(lang) or next((v for k, v in scan.place.items() if not k.startswith("_")), None)
    if lang not in scan.place:
        lbl = await geo.reverse(db, scan.center_lat, scan.center_lng, lang, timeout=2.0)
        place = lbl["place"]
    sat = sum(1 for hx in scan.hexes if hx["label"] == "satellite")
    return {
        "scan": {
            "id": str(scan.id),
            "center": {"lat": scan.center_lat, "lng": scan.center_lng},
            "center_cell": scan.center_cell,
            "radius_m": scan.radius_m,
            "k": scan.k,
            "h3_res": H.H3_RES,
            "cell_count": len(scan.hexes),
            "place": place,
            "status": scan.status,
            "job_id": str(scan.job_id) if scan.job_id and scan.status == "partial" else None,
            "acquired": scan.acquired,
            "baseline_lst_c": scan.baseline_lst_c,
            "method": scan.method,
            "outline": H.ring_outline(scan.center_cell, scan.k),
        },
        "hexes": scan.hexes,
        "zones": [summary(z, lang) for z in zones],
        "my_zone_id": my,
        "meta": {
            "live": scan.status == "complete",
            "stale": False,
            "generated_at": datetime.now(UTC).isoformat(),
            "sources": scan.sources,
            "pipeline_version": scan.pipeline_version,
        },
        "satellite_cells": sat,
    }


async def get_zone_row(db: AsyncSession, zid: str) -> ScanZone:
    z = await db.get(ScanZone, zid)
    if z is None:
        raise not_found("zone.not_found", "This zone isn't on the map any more")
    return z


async def superseded_by(db: AsyncSession, z: ScanZone) -> str | None:
    scan = await db.get(Scan, z.scan_id)
    if scan is None:
        return None
    newer = (
        await db.execute(
            select(Scan)
            .where(
                Scan.center_cell == scan.center_cell,
                Scan.k == scan.k,
                Scan.created_at > scan.created_at,
                Scan.status == "complete",
            )
            .order_by(Scan.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if newer is None or newer.composite_key == scan.composite_key:
        return None
    cand = (await db.execute(select(ScanZone).where(ScanZone.scan_id == newer.id))).scalars().all()
    mine = set(z.h3)
    best = max(cand, key=lambda c: len(mine & set(c.h3)), default=None)
    return best.id if best is not None and mine & set(best.h3) else None


async def job_status(db: AsyncSession, job_id: uuid.UUID) -> dict:
    j = await db.get(Job, job_id)
    if j is None:
        raise not_found("job.not_found", "No such job")
    status = {"queued": "queued", "running": "running", "done": "done", "failed": "failed"}.get(j.status, j.status)
    return {
        "status": status,
        "progress": round(j.progress, 3),
        "done_cells": j.done_cells,
        "total_cells": j.total_cells,
    }
