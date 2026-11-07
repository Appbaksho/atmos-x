"""Every API router, mounted under /api/v1 by main.py."""

from . import act, ask, auth, farm, me, meta, plan, sensors, weather, zones

ROUTERS = [
    meta.router,
    auth.router,
    me.router,
    zones.router,
    weather.router,
    sensors.router,
    plan.router,
    act.router,
    farm.router,
    ask.router,
]
