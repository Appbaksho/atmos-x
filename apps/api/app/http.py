"""Outbound HTTP (prompt-v1 §10): timeouts, retry with backoff, Retry-After, per-provider circuit breaker.

`fetch(provider, ...)` is the only way providers call the network. In a request path use the default
4 s timeout and `retries=0`; worker jobs pass longer timeouts and retries.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from .config import settings

log = logging.getLogger("atmos.http")

REQUEST_TIMEOUT_S = 4.0


class UpstreamError(Exception):
    def __init__(self, provider: str, message: str, status: int | None = None, retry_after: float | None = None):
        super().__init__(f"{provider}: {message}")
        self.provider = provider
        self.status = status
        self.retry_after = retry_after


class CircuitOpen(UpstreamError):
    pass


@dataclass
class Breaker:
    """Opens after `threshold` consecutive failures for `cooldown_s`; a 429 opens it for Retry-After."""

    threshold: int = 4
    cooldown_s: float = 120.0
    failures: int = 0
    open_until: float = 0.0
    last_ok: float | None = None
    last_error: str | None = None
    last_error_at: float | None = None
    calls: int = 0
    history: list[float] = field(default_factory=list)

    def allow(self) -> bool:
        return time.monotonic() >= self.open_until

    def ok(self) -> None:
        self.failures = 0
        self.open_until = 0.0
        self.last_ok = time.time()

    def fail(self, err: str, retry_after: float | None = None) -> None:
        self.failures += 1
        self.last_error = err[:200]
        self.last_error_at = time.time()
        if retry_after:
            self.open_until = time.monotonic() + min(retry_after, 3600)
        elif self.failures >= self.threshold:
            self.open_until = time.monotonic() + self.cooldown_s

    @property
    def state(self) -> str:
        if not self.allow():
            return "degraded"
        if self.failures and self.last_ok is None:
            return "degraded"
        return "ok"


BREAKERS: dict[str, Breaker] = {}


def breaker(provider: str) -> Breaker:
    b = BREAKERS.get(provider)
    if b is None:
        b = BREAKERS[provider] = Breaker()
    return b


_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            headers={"User-Agent": settings.user_agent},
            follow_redirects=True,
            limits=httpx.Limits(max_connections=40, max_keepalive_connections=20),
        )
    return _client


async def aclose() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _retry_after(resp: httpx.Response) -> float | None:
    v = resp.headers.get("retry-after")
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return 60.0


async def fetch(
    provider: str,
    method: str,
    url: str,
    *,
    timeout: float = REQUEST_TIMEOUT_S,
    retries: int = 0,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    json: Any = None,
    data: Any = None,
    auth: Any = None,
    ok_statuses: tuple[int, ...] = (200,),
) -> httpx.Response:
    """Fetch with breaker + retry. Raises UpstreamError (or CircuitOpen) on failure."""
    b = breaker(provider)
    if not b.allow():
        raise CircuitOpen(provider, "circuit open")
    attempt = 0
    while True:
        attempt += 1
        b.calls += 1
        try:
            resp = await client().request(
                method, url, params=params, headers=headers, json=json, data=data, auth=auth, timeout=timeout
            )
        except (httpx.TimeoutException, httpx.TransportError) as e:
            err = f"{type(e).__name__}"
            if attempt <= retries:
                await asyncio.sleep(min(2**attempt, 20))
                continue
            b.fail(err)
            raise UpstreamError(provider, err) from e
        if resp.status_code in ok_statuses:
            b.ok()
            return resp
        ra = _retry_after(resp) if resp.status_code in (429, 503) else None
        transient = resp.status_code in (429, 500, 502, 503, 504)
        if transient and attempt <= retries:
            await asyncio.sleep(min(ra or 2**attempt, 30))
            continue
        b.fail(f"HTTP {resp.status_code}", ra if resp.status_code == 429 else None)
        raise UpstreamError(provider, f"HTTP {resp.status_code}", status=resp.status_code, retry_after=ra)


async def get_json(provider: str, url: str, **kw) -> Any:
    resp = await fetch(provider, "GET", url, **kw)
    try:
        return resp.json()
    except ValueError as e:
        breaker(provider).fail("invalid JSON")
        raise UpstreamError(provider, "invalid JSON") from e


def provider_states() -> dict[str, dict]:
    return {
        name: {
            "state": b.state,
            "failures": b.failures,
            "last_ok": b.last_ok,
            "last_error": b.last_error,
        }
        for name, b in sorted(BREAKERS.items())
    }
