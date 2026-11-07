"""Clone Nadia's demo story into a demo user. Filled in as each feature lands on the server."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import User

SEEDERS: list = []


async def seed_story(db: AsyncSession, user: User) -> None:
    for fn in SEEDERS:
        await fn(db, user)
