# Atmos X

Find the hottest blocks around you from NASA satellite data, get a concrete cooling plan, plant and track trees that are proven alive, team up with neighbours, spend verified points in a store, and (for farmers) get crop and weather alerts, in 10 languages. Built for the NASA Space Apps Challenge 2026; Dhaka is the home story and the app works worldwide.

## Monorepo

| Path | What |
| --- | --- |
| `apps/web` | Next.js 16 landing page, web app and installable PWA. Talks only to the API through `/api/v1` rewrites. |
| `apps/api` | FastAPI + Postgres/PostGIS API and the job worker: heat pipeline, NASA providers, accounts, trees, points, community, store, payments. |

Atmos X ships only as a web app and installable PWA; there is no native app.

## Run it locally

Needs Docker, Python 3.12+ with [uv](https://docs.astral.sh/uv/), and Node 22.

```bash
cp .env.example .env     # the core heat loop works with no third-party keys
make env                 # copies only the web variables into apps/web/.env.local
cd apps/web && npm ci && cd ../..
make dev                 # Postgres (5433) + migrations + reference data, then API (8000), worker and web (3000)
```

Open http://localhost:3000 and choose "Try the Dhaka demo", or open `/app?demo=1`. The demo story is invented and never mixes with real data.

Other targets: `make test`, `make lint`, `make e2e` (Playwright, Chromium only), `make gen-client` (OpenAPI → typed web client), `make verify-sources` (one real request per data source), `make precompute` (Dhaka heat now). Create the first admin with `cd apps/api && uv run python -m app.scripts.make_admin you@example.org`.

## Deploy

`docker-compose.prod.yml` runs Postgres/PostGIS, the API, the worker and the web server; `deploy/` holds the nginx site. See [DEV-CHECKLIST.md](DEV-CHECKLIST.md) §5 before going live.

## Docs

- [prompt-v1.md](prompt-v1.md): the V1 specification
- [docs/v1/decisions.md](docs/v1/decisions.md): decisions made while building V1
- [docs/v1/source-check.md](docs/v1/source-check.md): live status of every data source
- [DEV-CHECKLIST.md](DEV-CHECKLIST.md): keys, accounts, phones, the presentation and every human task
- [prompt-v0.md](prompt-v0.md): the earlier presentable MVP, kept for history
