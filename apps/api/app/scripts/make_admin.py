"""Promote an existing account to admin (prompt-v1 A10): `python -m app.scripts.make_admin you@example.org`.

Use `--moderator` for a moderator. The person must have registered first; nothing is created.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from ..db import SessionLocal
from ..models import User


async def main(email: str, role: str) -> int:
    async with SessionLocal() as db:
        u = (await db.execute(select(User).where(User.email == email.strip().lower()))).scalar_one_or_none()
        if u is None:
            print(f"No account with {email}. Register first, then run this again.")
            return 1
        u.role = role
        u.session_version += 1  # sign in again to get the new role
        await db.commit()
        print(f"{email} is now {role}.")
        return 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        sys.exit(2)
    sys.exit(asyncio.run(main(args[0], "moderator" if "--moderator" in sys.argv else "admin")))
