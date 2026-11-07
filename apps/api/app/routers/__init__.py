"""Every API router, mounted under /api/v1 by main.py."""

from . import auth, me, meta

ROUTERS = [meta.router, auth.router, me.router]
