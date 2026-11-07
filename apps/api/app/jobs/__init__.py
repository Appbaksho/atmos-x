"""Job handlers and the schedule (prompt-v1 §8.7). Importing this module registers handlers."""

from __future__ import annotations

from apscheduler.triggers.cron import CronTrigger

from . import climate, daily, farm, heat, push, weather  # noqa: F401  (registers handlers)

SCHEDULE: list[dict] = [
    # Dhaka (and any other enabled region) nightly at 21:30 UTC = 03:30 Dhaka.
    {"id": "heat_regions", "fn": heat.enqueue_regions, "trigger": CronTrigger(hour=21, minute=30)},
    # Points unlock, tree reminders and badges at 02:00 UTC = 08:00 Dhaka (a sensible time for a nudge).
    {"id": "daily_people", "fn": daily.enqueue_daily, "trigger": CronTrigger(hour=2, minute=0)},
    # Farm alerts for saved fields twice a day: 00:30 and 12:30 UTC = 06:30 and 18:30 Dhaka.
    {"id": "farm_alerts", "fn": farm.enqueue_farm, "trigger": CronTrigger(hour="0,12", minute=30)},
    # Event reminders every hour for events starting within 24 h (once per event).
    {"id": "event_reminders", "fn": daily.enqueue_events, "trigger": CronTrigger(minute=5)},
    # Heat warnings for people's home areas at 01:00 UTC = 07:00 Dhaka (C12).
    {"id": "heat_warnings", "fn": daily.enqueue_heat_warnings, "trigger": CronTrigger(hour=1, minute=0)},
    # Web push for new notifications every 5 minutes (only when VAPID keys are set).
    {"id": "push_send", "fn": push.enqueue_push, "trigger": CronTrigger(minute="*/5")},
]

BOOT: list = [heat.boot_regions]


async def on_boot() -> None:
    """Work to queue when the worker starts (first-boot precompute etc.)."""
    for fn in BOOT:
        await fn()
