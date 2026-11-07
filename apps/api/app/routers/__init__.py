"""Every API router, mounted under /api/v1 by main.py."""

from . import auth, me, meta, weather, zones

ROUTERS = [meta.router, auth.router, me.router, zones.router, weather.router]
