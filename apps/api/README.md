# apps/api

The Atmos X API and job worker: FastAPI, async SQLAlchemy on Postgres 16 + PostGIS, Alembic, uv. Everything the web app shows comes from here, under `/api/v1` (OpenAPI at `/docs`).

## Run

From the repo root with the root `.env` in place: `make db migrate seed`, then `make api` (port 8000) and `make worker`. Or `make dev` for everything.

## Layout

| Path | What |
| --- | --- |
| `app/engines/` | Pure, unit-tested science and rules: heat score, cooling, weather/BMD, farmer rules, verification checks, AQI, points |
| `app/providers/` | Clients for external services: Planetary Computer (Landsat, HLS, WorldCover), NASA Earthdata (MODIS, ECOSTRESS, IMERG, SMAP, LIS/OTD), POWER, GEOS-FP/CF, CMIP6, Open-Meteo, OpenAQ, Nominatim, SSLCommerz; GIBS and Overpass are used from `app/services/` |
| `app/services/` | Use cases: scans and zones, plans, trees and checks, points ledger, community, store, company marketplace, payments, push, Ask Atmos |
| `app/routers/` | HTTP routes (`app/routers/__init__.py` lists them) |
| `app/jobs/`, `app/worker.py` | Postgres-backed job queue and schedule (heat precompute, reminders, farm alerts, push) |
| `app/scripts/` | `seed`, `make_admin`, `make_vapid`, `precompute`, `verify_sources`, `static_data`, `dump_openapi`, `make_env` |
| `alembic/` | Migrations |
| `tests/` | pytest against a separate `atmos_test` database, migrated once and truncated per test |

## Checks

`uv run ruff check` · `uv run ruff format --check` · `uv run pytest` · `make verify-sources` from the root.

## Container

`Dockerfile` builds one image for both the API (default command; the entrypoint migrates and seeds first) and the worker (`python -m app.worker` with `RUN_MIGRATIONS=0`). See `docker-compose.prod.yml`.
