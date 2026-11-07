"""Demo mode (prompt-v1 §8.4): a fresh server user cloned from Nadia's story, `is_demo = true`,
excluded from real leaderboards and deleted after 7 days. Heat data stays real.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import Profile, User
from .profile import point_wkt

DEMO_NAME = "Nadia Rahman"
DEMO_AREA = "Mohammadpur, Dhaka"


async def create_demo_user(db: AsyncSession, lang: str | None) -> User:
    user = User(role="user", display_name=DEMO_NAME, is_demo=True)
    db.add(user)
    await db.flush()
    lat, lng = settings.next_public_demo_lat, settings.next_public_demo_lng
    db.add(
        Profile(
            user_id=user.id,
            lang=lang or "en",
            home_lat=lat,
            home_lng=lng,
            home_geom=point_wkt(lat, lng),
            area=DEMO_AREA,
            city="Dhaka",
            country_code="BD",
            radius_m=200,
            onboarded=True,
            farmer_mode=False,
        )
    )
    await db.flush()
    from . import demo_story

    await demo_story.seed_story(db, user)
    return user
