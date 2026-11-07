"""Zones contract (prompt-v1 §9 'Zones')."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from .common import I18nText, LatLng, Meta

Label = Literal["satellite", "estimate", "no_data"]


class Contribution(BaseModel):
    driver: str
    value: float
    unit: str
    adds_c: float


class ZoneDrivers(BaseModel):
    sealed_pct: int | None
    green_pct: int | None
    water_pct: int | None
    ndvi: float | None
    dark_roof_pct: int | None
    pop_density_km2: float | None
    night_lst_c: float | None
    estimated: list[str]
    contributions: list[Contribution]
    other_c: float | None
    anom_day_c: float | None = None
    anom_night_c: float | None = None
    fit: dict | None = None
    as_of: str | None


class ZoneSummary(BaseModel):
    id: str
    scan_id: str
    name: str
    name_text: I18nText | None = None
    score: int
    lst_c: float | None
    label: Label
    dist_m: int
    rank: int
    near_tie: bool
    centroid: LatLng
    h3: list[str]
    area_km2: float
    drivers: ZoneDrivers


class HexOut(BaseModel):
    h3: str
    score: int | None
    lst_c: float | None
    label: Label


class Acquired(BaseModel):
    lst_from: str | None
    lst_to: str | None
    lst_scenes: int
    ndvi_date: str | None
    worldcover_year: int | None
    ecostress_passes: int
    night_source: str | None = None
    night_to: str | None = None
    window_days: int | None = None


class ScanInfo(BaseModel):
    id: str
    center: LatLng
    center_cell: str
    radius_m: int
    k: int
    h3_res: int
    cell_count: int
    place: str | None
    status: Literal["complete", "partial", "unavailable"]
    job_id: str | None
    acquired: Acquired
    baseline_lst_c: float | None
    method: Literal["landsat", "modis", "landcover"]
    outline: list[list[list[float]]]


class ZonesScanOut(BaseModel):
    scan: ScanInfo
    hexes: list[HexOut]
    zones: list[ZoneSummary]
    my_zone_id: str | None
    satellite_cells: int
    meta: Meta


class WhatIf(BaseModel):
    add_green_pct: int
    score_after: int | None
    lst_drop_c: float
    label: str = "estimate"


class HistoryPoint(BaseModel):
    year: int
    day_lst_c: float | None
    night_lst_c: float | None


class ZoneDetailOut(ZoneSummary):
    air_c: float | None
    feels_c: float | None
    causes: list[I18nText]
    why: list[I18nText]
    what_if_green: WhatIf
    history: list[HistoryPoint]
    history_kind: Literal["lst"] = "lst"
    history_status: Literal["ready", "pending", "unavailable"] = "pending"
    superseded_by: str | None
    place: str | None = None
    meta: Meta


class JobOut(BaseModel):
    status: str
    progress: float
    done_cells: int
    total_cells: int
