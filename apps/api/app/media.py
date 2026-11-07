"""Public media URLs. Files are served by FastAPI under /media (rewritten by Next)."""

from __future__ import annotations

import uuid


def photo_url(photo_id: uuid.UUID | str | None, size: str = "public") -> str | None:
    if not photo_id:
        return None
    return f"/media/photos/{photo_id}/{size}.jpg"
