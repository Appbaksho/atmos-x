"""Profile read/update (prompt-v1 §9 /me/profile)."""

from __future__ import annotations

from geoalchemy2.elements import WKTElement
from sqlalchemy.ext.asyncio import AsyncSession

from ..media import photo_url
from ..models import Profile, User
from ..schemas.auth import ProfileOut, ProfilePatch
from ..schemas.common import LatLng


def point_wkt(lat: float, lng: float) -> WKTElement:
    return WKTElement(f"POINT({lng} {lat})", srid=4326)


async def get_profile(db: AsyncSession, user: User) -> Profile:
    prof = await db.get(Profile, user.id)
    if prof is None:
        prof = Profile(user_id=user.id)
        db.add(prof)
        await db.flush()
    return prof


def profile_out(user: User, prof: Profile) -> ProfileOut:
    home = (
        LatLng(lat=prof.home_lat, lng=prof.home_lng)
        if prof.home_lat is not None and prof.home_lng is not None
        else None
    )
    return ProfileOut(
        display_name=user.display_name,
        avatar_url=photo_url(user.avatar_photo_id, "thumb"),
        bio=prof.bio,
        area=prof.area,
        home=home,
        radius_m=prof.radius_m,
        lang=prof.lang,  # type: ignore[arg-type]
        unit=prof.unit,  # type: ignore[arg-type]
        area_unit=prof.area_unit,  # type: ignore[arg-type]
        theme=prof.theme,  # type: ignore[arg-type]
        farmer_mode=prof.farmer_mode,
        ask_on=prof.ask_on,
        onboarded=prof.onboarded,
        push_on=prof.push_on,
    )


async def patch_profile(db: AsyncSession, user: User, body: ProfilePatch) -> Profile:
    prof = await get_profile(db, user)
    data = body.model_dump(exclude_unset=True)
    if "display_name" in data and data["display_name"] is not None:
        name = " ".join(data["display_name"].split())[:80]
        if name:
            user.display_name = name
    for k in ("bio", "area", "radius_m", "lang", "unit", "area_unit", "theme", "farmer_mode", "ask_on", "onboarded"):
        if k in data and data[k] is not None:
            setattr(prof, k, data[k])
    if body.home is not None:
        prof.home_lat, prof.home_lng = body.home.lat, body.home.lng
        prof.home_geom = point_wkt(body.home.lat, body.home.lng)
    elif body.clear_home:
        prof.home_lat = prof.home_lng = None
        prof.home_geom = None
    if user.role == "guest" and prof.radius_m > 500:
        prof.radius_m = 500
    await db.flush()
    return prof
