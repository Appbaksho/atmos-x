from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from .common import LatLng, Locale

Role = Literal["guest", "user", "moderator", "admin"]


class UserOut(BaseModel):
    id: str
    role: Role
    email: str | None
    phone_verified: bool = False
    display_name: str
    avatar_url: str | None = None
    is_demo: bool = False
    created_at: datetime


class SessionOut(BaseModel):
    user: UserOut
    created: bool = False


class RegisterIn(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=200)
    display_name: str = Field(default="", max_length=80)
    lang: Locale | None = None


class LoginIn(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=200)


class GuestIn(BaseModel):
    lang: Locale | None = None


class OtpStartIn(BaseModel):
    phone: str = Field(max_length=32)


class OtpStartOut(BaseModel):
    phone: str
    expires_in: int
    dev_console: bool = False


class OtpVerifyIn(BaseModel):
    phone: str = Field(max_length=32)
    code: str = Field(max_length=10)
    lang: Locale | None = None


class GoogleConfigOut(BaseModel):
    enabled: bool
    client_id: str | None


class GoogleIn(BaseModel):
    code: str = Field(max_length=2048)
    lang: Locale | None = None


class GoogleLinkIn(BaseModel):
    link_token: str = Field(max_length=4096)
    password: str = Field(max_length=200)


class ProfileOut(BaseModel):
    display_name: str
    avatar_url: str | None = None
    bio: str | None = None
    area: str | None = None
    home: LatLng | None = None
    radius_m: int
    lang: Locale
    unit: Literal["C", "F"]
    area_unit: Literal["metric", "imperial"]
    theme: Literal["light", "dark", "system"]
    farmer_mode: bool
    ask_on: bool
    onboarded: bool
    push_on: bool = False


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    bio: str | None = Field(default=None, max_length=280)
    area: str | None = Field(default=None, max_length=120)
    home: LatLng | None = None
    clear_home: bool = False
    radius_m: int | None = Field(default=None, ge=100, le=1000)
    lang: Locale | None = None
    unit: Literal["C", "F"] | None = None
    area_unit: Literal["metric", "imperial"] | None = None
    theme: Literal["light", "dark", "system"] | None = None
    farmer_mode: bool | None = None
    ask_on: bool | None = None
    onboarded: bool | None = None
