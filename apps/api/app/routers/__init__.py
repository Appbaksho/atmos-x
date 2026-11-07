"""Every API router, mounted under /api/v1 by main.py."""

from . import auth, me, meta, sensors, weather, zones

ROUTERS = [meta.router, auth.router, me.router, zones.router, weather.router, sensors.router]
