"""Every API router, mounted under /api/v1 by main.py."""

from . import act, ask, auth, community, farm, market, me, meta, plan, push, sensors, weather, zones

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
    community.router,
    market.router,
    push.router,
]
