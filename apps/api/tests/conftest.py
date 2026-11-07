"""Test setup: a separate database (atmos_test), migrated once; tables truncated per test.

Tests never hit the network: respx mocks every upstream.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

API_DIR = Path(__file__).resolve().parents[1]
BASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://atmos:atmos@localhost:5433/atmos_test")
os.environ["DATABASE_URL"] = BASE_URL
os.environ["APP_ENV"] = "test"
os.environ["DATA_MODE"] = "fixture"
os.environ["SMS_PROVIDER"] = "console"
os.environ["DATA_DIR"] = str(API_DIR / "data" / "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "x" * 40)
os.environ["COOKIE_SECURE"] = "false"
# Integrations off unless a test turns them on.
for k in (
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "OPENAQ_API_KEY",
    "EARTHDATA_TOKEN",
    "EARTHDATA_USERNAME",
    "EARTHDATA_PASSWORD",
    "SSLCOMMERZ_STORE_ID",
    "SSLCOMMERZ_STORE_PASSWORD",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "OPEN_METEO_API_KEY",
    "GOOGLE_VISION_API_KEY",
):
    os.environ[k] = ""


def _ensure_db() -> None:
    import asyncio

    import asyncpg

    async def go():
        dsn = BASE_URL.replace("postgresql+asyncpg", "postgresql").rsplit("/", 1)[0] + "/atmos"
        conn = await asyncpg.connect(dsn)
        try:
            exists = await conn.fetchval("select 1 from pg_database where datname = 'atmos_test'")
            if not exists:
                await conn.execute("create database atmos_test")
        finally:
            await conn.close()

    asyncio.run(go())
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=API_DIR,
        check=True,
        env=os.environ.copy(),
        capture_output=True,
    )


_ensure_db()

from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

KEEP = {"alembic_version", "spatial_ref_sys"}


@pytest.fixture(autouse=True)
async def clean_db():
    async with engine.begin() as conn:
        rows = await conn.execute(text("select tablename from pg_tables where schemaname = 'public'"))
        tables = [r[0] for r in rows if r[0] not in KEEP]
        await conn.execute(text("set local atmos.allow_ledger_delete = 'on'"))
        await conn.execute(text("truncate " + ", ".join(f'"{t}"' for t in tables) + " restart identity cascade"))
    from app import http

    http.BREAKERS.clear()
    yield


@pytest.fixture
async def db():
    async with SessionLocal() as s:
        yield s


def make_client() -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=app), base_url="http://localhost:3000", headers={"content-type": "application/json"}
    )


@pytest.fixture
async def client():
    async with make_client() as c:
        yield c


@pytest.fixture
async def client2():
    async with make_client() as c:
        yield c


async def signup(
    c: AsyncClient, email: str = "nadia@example.org", name: str = "Nadia", password: str = "correct horse"
) -> dict:
    r = await c.post("/api/v1/auth/register", json={"email": email, "password": password, "display_name": name})
    assert r.status_code == 200, r.text
    return r.json()["user"]
