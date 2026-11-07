"""FastAPI app (prompt-v1 §8). Served at /api/v1; Next rewrites /api/v1/* and /media/* here."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from . import errors, logs
from .config import settings
from .http import aclose

log = logging.getLogger("atmos")

API_PREFIX = "/api/v1"
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
# Gateways and devices that post forms or raw bodies.
CSRF_EXEMPT = (f"{API_PREFIX}/payments/sslcommerz/", f"{API_PREFIX}/sensors/ingest")


class ContentTypeGuard(BaseHTTPMiddleware):
    """State-changing requests must be JSON or multipart (§11). Blocks cross-site form posts."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if request.method in UNSAFE and path.startswith(API_PREFIX) and not path.startswith(CSRF_EXEMPT):
            ct = (request.headers.get("content-type") or "").lower()
            if not (ct.startswith("application/json") or ct.startswith("multipart/form-data")):
                return JSONResponse(
                    {"code": "request.content_type", "message": "Send JSON (application/json) or multipart/form-data"},
                    status_code=415,
                )
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logs.setup(settings.log_level)
    settings.validate_for_env()
    settings.data_path.mkdir(parents=True, exist_ok=True)
    off = settings.integrations_off()
    log.info(
        "startup", extra={"data": {"env": settings.app_env, "data_mode": settings.data_mode, "integrations_off": off}}
    )
    yield
    await aclose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Atmos X API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url=f"{API_PREFIX}/docs",
        openapi_url=f"{API_PREFIX}/openapi.json",
        redoc_url=None,
    )
    errors.install(app)
    app.add_middleware(ContentTypeGuard)
    app.add_middleware(logs.RequestIdMiddleware)

    from .routers import ROUTERS
    from .routers.media import router as media_router

    api = APIRouter(prefix=API_PREFIX)
    for r in ROUTERS:
        api.include_router(r)
    app.include_router(api)
    app.include_router(media_router)
    return app


app = create_app()
