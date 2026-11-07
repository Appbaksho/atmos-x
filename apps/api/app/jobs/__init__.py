"""Job handlers and the schedule (prompt-v1 §8.7). Importing this module registers handlers."""

from __future__ import annotations

from apscheduler.triggers.cron import CronTrigger

from . import heat

SCHEDULE: list[dict] = [
    # Dhaka (and any other enabled region) nightly at 21:30 UTC = 03:30 Dhaka.
    {"id": "heat_regions", "fn": heat.enqueue_regions, "trigger": CronTrigger(hour=21, minute=30)},
]

BOOT: list = [heat.boot_regions]


async def on_boot() -> None:
    """Work to queue when the worker starts (first-boot precompute etc.)."""
    for fn in BOOT:
        await fn()
