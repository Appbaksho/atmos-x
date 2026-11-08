# Atmos X V1 (prompt-v1 §8.1). Run from the repo root.
SHELL := /bin/bash
API := apps/api
WEB := apps/web
UV := env -u VIRTUAL_ENV uv run --project $(API)
PY := cd $(API) && env -u VIRTUAL_ENV uv run

.PHONY: env db db-down api worker web dev migrate seed gen-client static-data verify-sources precompute test test-api test-web e2e lint

env:            ## copy web-only variables into apps/web/.env.local
	@cd $(API) && env -u VIRTUAL_ENV uv run python -m app.scripts.make_env

db:             ## start Postgres 16 + PostGIS (127.0.0.1:5433)
	docker compose up -d --wait db

db-down:
	docker compose down

migrate:        ## apply Alembic migrations
	$(PY) alembic upgrade head

seed:           ## reference data: action types, species, costs, badges, points, regions
	$(PY) python -m app.scripts.seed

api:            ## FastAPI on :8000 with reload
	$(PY) uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app --timeout-keep-alive 75

worker:         ## job runner + schedule
	$(PY) python -m app.worker

web:            ## Next.js on :3000
	cd $(WEB) && npm run dev

dev: db migrate seed  ## everything: db, api, worker, web
	@$(MAKE) -j3 api worker web

gen-client:     ## OpenAPI → apps/web/src/lib/api/schema.d.ts
	$(PY) python -m app.scripts.dump_openapi ../web/src/lib/api/openapi.json
	cd $(WEB) && npx openapi-typescript src/lib/api/openapi.json -o src/lib/api/schema.d.ts --default-non-nullable false

static-data:    ## one-time downloads into DATA_DIR/static (DB-IP; LIS/OTD and GPW need Earthdata)
	$(PY) python -m app.scripts.static_data

verify-sources: ## one real request per source → docs/v1/source-check.md
	$(PY) python -m app.scripts.verify_sources --write ../../docs/v1/source-check.md

precompute:     ## run the Dhaka heat precompute now (normally nightly in the worker)
	$(PY) python -m app.scripts.precompute

test: test-api test-web

test-api:
	$(PY) pytest -q

test-web:
	cd $(WEB) && npm test

lint:
	$(PY) ruff check .
	cd $(WEB) && npm run lint && npm run typecheck

e2e:            ## Playwright, Chromium only, ≤ 2 workers
	cd $(WEB) && npx playwright test --project=chromium-desktop --project=chromium-mobile --workers=2
