# Atmos X: monorepo rules (humans + agents)

## Apps
| Path | State | Notes |
| --- | --- | --- |
| `apps/web` | **active (V1)** | Next.js 16 landing + web app + PWA. Data only from `apps/api` via `/api/v1` rewrites. |
| `apps/api` | **active (V1)** | FastAPI + Postgres/PostGIS + worker. See `prompt-v1.md`. |

Plans: `prompt-v1.md` (current), `DEV-CHECKLIST.md` (human tasks), `docs/v1/decisions.md` (decisions). `prompt-v0.md` is history.

## History
There is no native or Expo app; the old prototype is at `git show 9841c47:apps/mobile/<path>`. The V0 Next.js route handlers (`src/app/api/v0`) and server code (`src/server`) were removed in V1 Stage 7; read them with `git log --all -- apps/web/src/server`.

## Rules
- Read `apps/web/AGENTS.md`: Next.js 16 differs from your training data. Read `apps/web/node_modules/next/dist/docs/` before using an API. `middleware.ts` is now **`src/proxy.ts`**.
- Screens get data **only** through `apps/web/src/lib/data/hooks`. The contract types are in `apps/web/src/lib/data/types.ts` (snake_case) and the generated client in `src/lib/api/` (`make gen-client` after API changes). No demo numbers inside screens.
- Secrets live only in the root `.env` and are read by the API. The web server gets only `API_ORIGIN` and `NEXT_PUBLIC_*` values (`make env`). Never use `NEXT_PUBLIC_` for secrets. Never print `.env` or `.env.local`.
- No language model at runtime, no `openai` package, no Google Earth Engine. Every number shows its source and kind; estimates say so.
- No hard-coded user-facing strings. Use next-intl messages in `src/i18n/messages/{locale}/{namespace}.json`, merged with `npm run i18n:merge -- delta.json` for all 10 locales; `npm run i18n:check` must pass.
- Every screen has loading, error, empty and guest-restricted states, plus dark mode, RTL (ur, ar), 360 px and 1280 px layouts.
- Playwright: Chromium projects only, at most 2 workers.
- Agents working in parallel in the same tree: **don't run `next build` or `next dev`** (the integrator does). Use `npm run typecheck`, `npm run lint` and `npm test`, and only fix errors in your own files.

## Commands
Root: `make dev` · `make test` · `make lint` · `make e2e` · `make gen-client` · `make verify-sources` · `make env`

`apps/web`: `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run i18n:merge` · `npm run i18n:check`

`apps/api`: `uv run pytest` · `uv run ruff check` · `uv run alembic upgrade head` · `uv run python -m app.scripts.seed` · `uv run python -m app.scripts.make_admin <email>`
