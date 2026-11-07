# V1 decisions log

Decisions made while executing `prompt-v1.md`, newest last. Each has the reason.

## Stage 0 baseline (7 Nov 2026)

| Check | Result |
| --- | --- |
| `npm ci` | ok (Node 24.18, npm blocks install scripts by default; nothing needed them) |
| `npm test` | 116 passed |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run i18n:check` | 0 missing keys, 19 non-fatal glossary warnings |
| `npm run build` | ok |
| Docker | Docker Desktop 29.0.1 started with `open -a Docker`; PostGIS container healthy |
| Python | 3.13 via uv 0.13.7 (system default is 3.10, too old) |
| GDAL (rasterio wheel) | 3.12.2 |

## Decisions

**D1. Branches, PRs and pushing.** The prompt says "commit locally on branch `v1` only". The owner's
instruction for this run overrides it: one branch per piece of work (`v1/<topic>`), frequent commits,
a PR into `main` for each, merged by the agent. `main` has no CI and no deploy hook, so merging does
not deploy. Production and the VPS are still untouched.

**D2. Local Postgres on port 5433.** A Homebrew Postgres 17 already listens on 5432 on the dev
machine and hosts other projects, so the dev PostGIS container binds `127.0.0.1:5433`
(`POSTGRES_PORT` overrides it). `.env.example` and `DATABASE_URL` say 5433.

**D3. PostGIS image.** `postgis/postgis:16-3.5` is published for amd64 only. It runs under Rosetta on
Apple silicon, which is fast enough for development and matches the amd64 VPS. No third-party
multi-arch image is used.

**D4. Compose files.** The old `docker-compose.yml` was the production web stack; it is now
`docker-compose.prod.yml` (deploy docs updated). `docker-compose.yml` is the dev database (§8.1).

**D5. Env files.** The root `.env` is the only file people edit. It already had the V1 shape. Two
values (`SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`) were only in `apps/web/.env.local`; they
were copied into the root `.env` without printing them. `JWT_SECRET` was the placeholder and was
replaced with a generated value. The pre-change file is kept as `.env.pre-v1.bak` (gitignored).
`make env` later rewrites `apps/web/.env.local` with web variables only, moving the old one to
`.env.local.v0.bak`. `OPENAI_API_KEY` is still in the owner's `.env`; V1 never reads it (§3.2).

**D6. `apps/web/.env.example` scrubbed.** It held a real-looking Google OAuth client secret. It now
points to the root template and lists web variables only. The secret is still in git history and must
be rotated by a person (§14 item 1).
