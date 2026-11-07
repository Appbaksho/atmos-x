"""Structured JSON logs with request ids (prompt-v1 §11)."""

from __future__ import annotations

import contextvars
import json
import logging
import sys
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

log = logging.getLogger("atmos")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {
            "t": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)) + "Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "rid": request_id.get(),
        }
        extra = getattr(record, "data", None)
        if isinstance(extra, dict):
            out.update(extra)
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str)


def setup(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    for noisy in ("httpx", "httpcore", "rasterio", "apscheduler.executors.default"):
        logging.getLogger(noisy).setLevel("WARNING")


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        token = request_id.set(rid)
        t0 = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            request_id.reset(token)
        ms = round((time.perf_counter() - t0) * 1000)
        response.headers["x-request-id"] = rid
        if request.url.path not in ("/api/v1/health",):
            log.info(
                "request",
                extra={
                    "data": {
                        "rid": rid,
                        "method": request.method,
                        "path": request.url.path,
                        "status": response.status_code,
                        "ms": ms,
                    }
                },
            )
        return response
