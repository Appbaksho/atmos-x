"""Job handlers and the schedule (prompt-v1 §8.7). Importing this module registers handlers."""

from __future__ import annotations

SCHEDULE: list[dict] = []


async def on_boot() -> None:
    """Work to queue when the worker starts (first-boot precompute etc.)."""
    for fn in BOOT:
        await fn()


BOOT: list = []
