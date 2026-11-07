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

**D7. Session bootstrap.** Every visitor to the app gets a server guest. The client calls
`POST /auth/guest`, which returns the signed-in user when a session exists and creates a guest
otherwise. This avoids a 401 from `GET /auth/me` on first load (Playwright fails on console errors,
E17). `GET /auth/me` stays in the contract.

**D8. Presentation mode.** `POST /auth/demo` creates a fresh demo user and keeps the previous session
token in an httpOnly `atmos_prev_session` cookie; `POST /auth/demo/exit` restores it (or signs out).
This replaces V0's separate "demo" IndexedDB namespace.

**D9. Prefs.** Device prefs stay in IndexedDB for an instant first paint and mirror to
`PATCH /me/profile`. On load the server profile wins once it is onboarded; a fresh server profile
takes the device's prefs. The default radius is now 200 m (H3).

**D10. Auth limits in development.** Per-IP auth limits are ×20 outside production, because local
development and e2e runs all come from 127.0.0.1. Production keeps the stated limits.

**D11. Google account linking.** When Google returns an email that already has a password account,
the API answers 409 `auth.link_requires_password` with a 10-minute signed link token; the client asks
for the password and calls `POST /auth/google/link`. The one-time Google code is never replayed.

**D12. Earthdata login without `earthaccess`.** The plan lists `earthaccess`, but it pulls in a large
dependency tree (fsspec, s3fs, pqdm). Token retrieval and bearer-token reads are a few HTTP calls, so
they are done directly with httpx (`providers/earthdata.py`).

**D13. Dev ports.** Another project's Docker container already serves port 3000 on the dev machine, so
local runs of the web app used port 3001 (`E2E_BASE_URL=http://localhost:3001`).

**D14. Earthdata Login (URS) is unreachable from the build machine.** `urs.earthdata.nasa.gov`
(198.118.243.33:443) times out over IPv4 and IPv6, while the NASA data hosts answer. The owner's
`EARTHDATA_TOKEN` (valid to 6 Jan 2027) works as a bearer token on LP DAAC (ECOSTRESS) and on the
GES DISC file host (IMERG). So the Earthdata provider prefers the token and only tries URS
(`find_or_create_token`) when no token is set. Token-free URS flows cannot be verified from here.

**D15. GEOS-FP humidity.** `tavg1_2d_slv_Nx` has no `t2mdew` (prompt §5.2 assumed it). Only daily
Tmax/Tmin come from GEOS-FP; feels-like uses Open-Meteo humidity. `qv2m` and `ps` exist if needed.

**D16. Driver fit.** Land-cover shares nearly sum to 1, so plain OLS (§7.4) split them arbitrarily
and gave sealed surfaces a negative effect on real Dhaka data. The fit is sign-constrained (sealed
and dark surfaces warm; green and water cool) with a small ridge on standardized drivers. On the
Dhaka composite: sealed +1.04, green −1.76, water −3.27 °C per unit share, dark surface 0, R² 0.36.
The residual is shown as "other factors".

**D17. IMERG reads.** GES DISC Hyrax OPeNDAP needs a URS cookie (401 with a bearer token) and the
cloud OPeNDAP rejected DAP2/DAP4 constraints, so IMERG daily files (≈ 28 MB global) are read from
`data.gesdisc.earthdata.nasa.gov` by a daily worker job and sampled per active 0.1° cell.

**D18. Read concurrency.** Planetary Computer COG reads take ~4 s each from the build machine. With
the §7.1 cap of 4 concurrent reads a 2,401-hex chunk job takes ~80 s and the Dhaka region ~60 s, so
cold areas complete in about 1–2 minutes, not the ~30 s target. The cap is kept (unconfirmed rate
limits); scans return `partial` in well under 2 s meanwhile.

**D19. ECOSTRESS checks (first read, as §5.2 asked).** `ECO_L2T_LSTE.002` LST is float32 Kelvin with
NaN fill, 70 m UTM, one file per MGRS tile; `cloud` and `water` are uint8 0/1. Dhaka straddles tiles
45QZG and 46QBM, and an orbit's swath is split into consecutive scenes a minute apart, so passes are
grouped by orbit number and all their scenes and tiles merged. `LST_err` on clear Dhaka passes is
3.1–3.4 K, so the plan's `LST_err ≤ 2 K` rejected every pass; the threshold is 3.5 K. ECOSTRESS only
adds the relative day pattern (0.3 weight), where a uniform error cancels. Protected assets are read
through presigned URLs (GDAL must not forward the bearer header to S3).

**D20. Earthdata application approvals.** LP DAAC (ECOSTRESS), NSIDC (SMAP) and GHRC (LIS/OTD) accept
the owner's token. GES DISC (IMERG) answers "EULA Acceptance Failure": the account has not approved the
NASA GESDISC DATA ARCHIVE application. Until a person approves it, rain falls back to NASA POWER,
labelled. This is a human task.

**D21. Tree milestones are awarded at the check-in, not by a timer.** PT3 (90 days) and PT4 (1 year)
mean "alive", which only a check-in shows, so they are awarded when an on-schedule check-in passes
its checks at age ≥ 90 / ≥ 365 days. The same 90-day check-in unlocks the tree's pending PT1/PT2
(PT9). The daily worker unlocks non-tree points 90 days after verification, sends one reminder per due
date (an "at risk" one after 15 days overdue) and a 90-day nudge, and re-evaluates badges (PT11).

**D22. Invite a friend to water (T5) and PT7.** `POST /trees/{id}/invite` returns a signed 14-day link
(not a session token). Accepting adds the person as a tree helper (`tree_helpers`): they can see the
tree and check in, the owner keeps the points. If the person signed up after the link was issued,
`users.invited_by_id` is set, and the inviter earns PT7 (25, pending 90 days) once that person's first
planting is verified.

**D23. Device import (A9).** Imported items keep `v0:<id>` client ids, so retries add nothing. Imported
claims earn nothing by themselves: imported actions wait for review (`reason_code = imported`),
imported trees linked to an imported planting stay "verifying" until that review, and imported
check-ins carry no points. Goals whose centroid lies in a zone on the current map become goals; the
rest become goal drafts.

**D24. Farmer alert details.** The 9 V0 rules are ported with their thresholds. Additions: cold wave
uses the 4 BMD bands (severe and very severe are both "danger"); `heavy_rain` fires at BMD "heavy"
(≥ 44 mm/24 h, forecast or IMERG observed) and is "danger" above 88 mm; drought uses SMAP root-zone
wetness when cached (< 0.30 watch, < 0.20 warning, rules of thumb), else NASA POWER 30-day rain with
Open-Meteo ET0, and makes no claim without either; lightning scales the CAPE thresholds by the
LIS/OTD monthly climatology weight (0.5–2), so a quiet month needs more instability. Alert ids are
`<rule>-<from>@<0.1° cell>`; "I've done it" is stored per person and alert. Saved fields are checked
twice a day (06:30 and 18:30 Dhaka) and notified once per field and alert (danger and warning only).

**D25. Ask Atmos sends codes, not prose.** The SSE contract keeps its event names, but `token`,
`warning` and `notice` carry I18nText (one sentence per `token`), rendered by the client from the
`server.ask.*` templates in 10 languages with local digits; `done` adds `intent` and follow-up
`suggestions`. Chips send intent ids. Intent keywords cover all 10 languages; messages of 3 words or
fewer without a keyword use the screen's topic, longer ones get the "what I can answer" reply and are
stored as unanswered. Limits are counted on the server per day (Dhaka time). The V0 `/api/v0/ask`,
`/verify-photo` and `/tree-check` routes and their OpenAI code were removed in this step because
nothing calls them any more; the rest of `src/server` goes in Stage 7.

**D26. Community details.** Team roles are `lead` and `member`; teams hold 2–5 people and a person is in
at most 5 teams; when the last lead leaves, the longest-standing member becomes lead. Team and org
stats come from the ledger rows behind each team's trees and actions. Leaderboard weeks start on
Monday and months on the 1st (Dhaka time); "area" is 3 km around the requester's home or given point.
Posts store area, city and a location rounded to 0.01°; their photos are public, so they wait for
moderation. Mentions use `@[Name](user-id)` markup written by the client. New accounts (under 24 h)
may post 5 times and comment 20 times a day. The demo community is a fixed, shared set of invented
people, teams, one organization, posts and an event (ids from a UUID5 namespace); demo users join it
and are purged after 7 days, while the shared community stays.
