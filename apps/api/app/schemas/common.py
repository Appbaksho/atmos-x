"""Shared contract types (prompt-v1 §9)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

DataKind = Literal["observation", "model", "forecast", "derived", "estimate", "reference", "demo"]
Locale = Literal["en", "bn", "ur", "hi", "ar", "es", "fr", "pt", "id", "zh"]
LOCALES: tuple[str, ...] = ("en", "bn", "ur", "hi", "ar", "es", "fr", "pt", "id", "zh")


class LatLng(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class Source(BaseModel):
    id: str
    name: str
    url: str | None = None
    as_of: str | None = None
    kind: DataKind | None = None
    resolution_m: float | None = None


class Meta(BaseModel):
    live: bool = True
    stale: bool = False
    generated_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    sources: list[Source] = Field(default_factory=list)
    pipeline_version: str | None = None


class I18nText(BaseModel):
    code: str
    params: dict[str, str | int | float] | None = None


class Err(BaseModel):
    code: str
    message: str
    fields: dict[str, str] | None = None
    retry_after: int | None = None


class Ok(BaseModel):
    ok: bool = True


def lang_or_en(lang: str | None) -> str:
    return lang if lang in LOCALES else "en"
