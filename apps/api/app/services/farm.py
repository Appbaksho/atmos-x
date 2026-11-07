"""Farmer alerts and saved fields (prompt-v1 §7.9).

The request path reads the Open-Meteo forecast (cached, 4 s) and whatever NASA context is already
cached (POWER 30-day rain, IMERG last 72 h, SMAP root-zone wetness, per 0.1° cell per day); missing
context is queued for the worker and the rules fall back. Each alert lists only the sources it used.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..engines import farmer as F
from ..errors import AppError, not_found
from ..http import UpstreamError
from ..models import AlertAcknowledgement, FarmField, User
from ..providers import power as power_p
from ..sources import SRC
from . import conditions_now as CN
from . import lightning
from .conditions import _cached_or_enqueue, recent_key
from .hydro import cell01, imerg_key, smap_key

MAX_FIELDS = 20


def alert_id(rule: str, frm: str, lat: float, lng: float) -> str:
    a, b = cell01(lat, lng)
    return f"{rule}-{frm}@{a},{b}"


async def _context(db: AsyncSession, lat: float, lng: float) -> dict:
    out: dict = {"rain30_mm": None, "imerg": None, "smap": None, "power_as_of": None}
    recent = await _cached_or_enqueue(
        db, recent_key(lat, lng), "power_recent", {"lat": round(lat, 1), "lng": round(lng, 1)}
    )
    if recent:
        days = [d for d in recent.value.get("days", []) if d.get("rain_mm") is not None][-30:]
        if len(days) >= 28:  # older caches held 21 days; a 30-day sum needs (almost) 30
            out["rain30_mm"] = round(sum(d["rain_mm"] for d in days), 1)
            out["power_as_of"] = recent.as_of
    ca, cb = cell01(lat, lng)
    im = await _cached_or_enqueue(db, imerg_key(lat, lng), "imerg", {"lat": ca, "lng": cb})
    if im and im.value.get("sum_mm") is not None:
        vals = [v for v in im.value.get("days", {}).values() if v is not None]
        out["imerg"] = {"sum_mm": im.value["sum_mm"], "max_mm": max(vals) if vals else None, "as_of": im.as_of}
    sm = await _cached_or_enqueue(db, smap_key(lat, lng), "smap", {"lat": ca, "lng": cb})
    if sm and sm.value.get("rootzone_wetness") is not None:
        out["smap"] = {"rootzone": sm.value["rootzone_wetness"], "as_of": sm.as_of}
    return out


async def alerts(
    db: AsyncSession,
    lat: float,
    lng: float,
    crop: str,
    stage: str,
    *,
    user: User | None = None,
    field_id: uuid.UUID | None = None,
) -> dict:
    if crop not in F.CROPS:
        raise AppError(400, "farm.crop", "Unknown crop", fields={"crop": "unknown"})
    if stage not in F.STAGES:
        raise AppError(400, "farm.stage", "Unknown growth stage", fields={"stage": "unknown"})
    fc_c = await CN.forecast(db, lat, lng)  # UpstreamError → 503 when Open-Meteo is down and nothing is cached
    fc = fc_c.value
    today = fc["current"]["time"][:10]
    month = int(today[5:7])
    region = F.region_of(lat, lng)
    upstream = None
    if region["haor"]:
        try:
            upstream = (await CN.forecast(db, *F.UPSTREAM_CHERRAPUNJI)).value
        except UpstreamError:
            upstream = None
    ctx = await _context(db, lat, lng)
    w, rate = lightning.weight(lat, lng, month)
    x = F.Inputs(
        daily=[d for d in fc["daily"] if d["date"] >= today],
        hourly=fc["hourly"],
        lat=lat,
        lng=lng,
        crop=crop,
        stage=stage,
        month=month,
        upstream_daily=[d for d in upstream["daily"] if d["date"] >= today] if upstream else None,
        rain30_mm=ctx["rain30_mm"],
        imerg_72h_mm=ctx["imerg"]["sum_mm"] if ctx["imerg"] else None,
        imerg_max_day_mm=ctx["imerg"]["max_mm"] if ctx["imerg"] else None,
        smap_rootzone=ctx["smap"]["rootzone"] if ctx["smap"] else None,
        lightning_weight=w,
        lightning_rate=rate,
    )
    drafts = F.rules(x)
    base = SRC["open_meteo"].src(as_of=fc_c.as_of, kind="model").model_dump()
    as_of = {
        "power": ctx["power_as_of"],
        "imerg": (ctx["imerg"] or {}).get("as_of"),
        "smap": (ctx["smap"] or {}).get("as_of"),
    }

    def source(sid: str) -> dict:
        if sid == "open_meteo_upstream":
            s = SRC["open_meteo"].src(as_of=fc_c.as_of, kind="forecast").model_dump()
            return {**s, "id": "open_meteo_upstream", "name": "Open-Meteo (upstream Meghalaya)"}
        return SRC[sid].src(as_of=as_of.get(sid)).model_dump()

    done: set[str] = set()
    if user is not None:
        done = set(
            (await db.execute(select(AlertAcknowledgement.alert_id).where(AlertAcknowledgement.user_id == user.id)))
            .scalars()
            .all()
        )
    out = []
    used: dict[str, dict] = {"open_meteo": base}
    for a in drafts:
        aid = alert_id(a["rule"], a["from"], lat, lng)
        srcs = [base] + [source(s) for s in a["sources"]]
        for s in srcs:
            used.setdefault(s["id"], s)
        out.append(
            {
                "id": aid,
                "rule": a["rule"],
                "hazard": a["hazard"],
                "level": a["level"],
                "emoji": a["emoji"],
                "title": a["title"],
                "body": a["body"],
                "actions": a["actions"],
                "window": {"from": a["from"], "to": a["to"]},
                "sources": srcs,
                "done": aid in done,
            }
        )
    return {
        "alerts": out,
        "region": F.region_name(lat, lng),
        "field_id": str(field_id) if field_id else None,
        "context": {
            "rain30_mm": ctx["rain30_mm"],
            "imerg_72h_mm": x.imerg_72h_mm,
            "smap_rootzone": x.smap_rootzone,
            "lightning_flash_rate": rate,
        },
        "meta": {
            "live": fc_c.fresh,
            "stale": fc_c.stale,
            "generated_at": datetime.now(UTC).isoformat(),
            "sources": list(used.values()),
        },
    }


async def alert_by_id(
    db: AsyncSession, aid: str, lat: float, lng: float, crop: str, stage: str, user: User | None
) -> dict:
    res = await alerts(db, lat, lng, crop, stage, user=user)
    for a in res["alerts"]:
        if a["id"] == aid:
            return {**a, "region": res["region"], "meta": res["meta"]}
    raise not_found("farm.alert_gone", "This alert has ended or changed")


async def mark_done(db: AsyncSession, user: User, aid: str, field_id: uuid.UUID | None) -> None:
    if field_id is not None:
        f = await db.get(FarmField, field_id)
        if f is None or f.user_id != user.id:
            raise not_found("farm.field_not_found", "Field not found")
    exists = (
        await db.execute(
            select(AlertAcknowledgement).where(
                AlertAcknowledgement.user_id == user.id, AlertAcknowledgement.alert_id == aid
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        db.add(AlertAcknowledgement(user_id=user.id, alert_id=aid[:120], field_id=field_id))
    await db.commit()


# ── fields ──────────────────────────────────────────────────────────────────


def field_out(f: FarmField) -> dict:
    return {
        "id": str(f.id),
        "name": f.name,
        "crop": f.crop,
        "stage": f.stage,
        "location": {"lat": f.lat, "lng": f.lng},
        "area": f.area,
        "created_at": f.created_at.isoformat(),
    }


def _check(crop: str | None, stage: str | None) -> None:
    if crop is not None and crop not in F.CROPS:
        raise AppError(400, "farm.crop", "Unknown crop", fields={"crop": "unknown"})
    if stage is not None and stage not in F.STAGES:
        raise AppError(400, "farm.stage", "Unknown growth stage", fields={"stage": "unknown"})


async def add_field(
    db: AsyncSession,
    user: User,
    *,
    name: str,
    crop: str,
    stage: str,
    lat: float,
    lng: float,
    area: float | None,
    client_id: str | None,
) -> FarmField:
    _check(crop, stage)
    if client_id:
        dup = (
            await db.execute(select(FarmField).where(FarmField.user_id == user.id, FarmField.client_id == client_id))
        ).scalar_one_or_none()
        if dup:
            return dup
    n = (await db.execute(select(func.count()).select_from(FarmField).where(FarmField.user_id == user.id))).scalar_one()
    if n >= MAX_FIELDS:
        raise AppError(409, "farm.too_many_fields", f"You can save up to {MAX_FIELDS} fields")
    f = FarmField(
        user_id=user.id,
        name=name.strip()[:80] or crop,
        crop=crop,
        stage=stage,
        lat=lat,
        lng=lng,
        area=area,
        client_id=client_id,
    )
    db.add(f)
    await db.commit()
    return f


async def get_field(db: AsyncSession, user: User, field_id: uuid.UUID) -> FarmField:
    f = await db.get(FarmField, field_id)
    if f is None or f.user_id != user.id:
        raise not_found("farm.field_not_found", "Field not found")
    return f


async def patch_field(db: AsyncSession, f: FarmField, patch: dict) -> FarmField:
    _check(patch.get("crop"), patch.get("stage"))
    for k in ("name", "crop", "stage", "area"):
        if patch.get(k) is not None:
            setattr(f, k, patch[k])
    if patch.get("location"):
        f.lat, f.lng = patch["location"]["lat"], patch["location"]["lng"]
    await db.commit()
    return f


_ = power_p  # POWER is read through the conditions cache (power_recent job)
