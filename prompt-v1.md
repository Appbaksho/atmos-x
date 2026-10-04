# Atmos X: v1 build prompts (full MVP)

> **Who this is for:** the Atmos X team and the AI coding agents (Claude Code or similar) you hand work to.
> **Goal of v1:** the full MVP, with a real FastAPI + Postgres backend, real accounts, and NASA data (Landsat, HLS, MODIS, POWER, GEOS, IMERG, SMAP…) behind a fixed API contract. It is still an MVP and still far from the finished product.
> **Comes after [prompt-v0.md](prompt-v0.md)**, the presentable MVP: Next.js web + PWA + OpenStreetMap + OpenAI, with no backend. Read §0.1 to see what v0 already did.
> **Human tasks** (accounts, keys, env, VPS) are in **[DEV-CHECKLIST.md](DEV-CHECKLIST.md)**, which is the canonical list. §6 here keeps the env templates the agents need.

> **The Expo app is gone.** Atmos X ships only as the Next.js web app + PWA. The Expo prototype (`apps/mobile`) was removed after the v0 port. Every "port from `apps/mobile/…`" pointer below refers to it: read the original with `git show 9841c47:apps/mobile/<path>`. Most of that logic now lives in TypeScript in `apps/web/src/server/**` and `apps/web/src/lib/data/**`; prefer those as the reference.

---

## 0. How to use this file

1. **Humans: start DEV-CHECKLIST.md §3 right now, even while v0 is being built.** Google Earth Engine and Earthdata approval can take hours, and they are the critical path for real NASA data.
2. Every agent prompt below begins with *"Read `prompt-v1.md` §1–§5 first."* Those sections are the shared context, so the prompts don't repeat it.
3. Run each prompt in **its own git worktree and branch** (`git worktree add ../atmos-<id> -b feat/<id>`). That lets parallel agents work without touching each other's files.
4. **One human is the Integrator.** They merge branches in dependency order (§7), resolve conflicts, and run the smoke test (`make dev`, then open `/app`) after every merge.
5. Each prompt lists the folders it **owns**. Agents edit only inside those folders, apart from the shared files each prompt names explicitly.
6. Owner tags: 🤖 = an agent runs it, 🧑 = a human does it, 🤖+🧑 = an agent builds it and a human verifies.
7. When a prompt finishes, the agent writes a short handoff note in `docs/handoff/<id>.md`: what was done, what was stubbed, the commands to run it, and known gaps.

### 0.1 Starting from v0 (read this before running any prompt below)

The prompts below were written as if starting from the Expo app. **v0 has already done a large part of Track A.** Start every v1 agent with:

> *"v0 is merged: apps/web exists (see prompt-v0.md and docs/handoff/v0-*.md). Build on it; don't re-scaffold it or re-port screens."*

Then use this table:

| v1 prompt | Status after v0 | What it means in v1 |
| --- | --- | --- |
| P0 restructure | **Done in V0-0** (and `apps/mobile` has since been deleted) | Only add the parts v0 skipped: `docker-compose.yml` (PostGIS), the `Makefile`, `docs/api-contract.md` (copied from §5), and `apps/api` env templates. |
| A1 web foundation | **Mostly done in V0-1** | Remaining work: switch `src/lib/data/hooks` internals from `/api/v0` + IndexedDB to the generated FastAPI client (`make gen-client`). Switch the session from local accounts to cookie auth (`/auth/*`). Change the next.config rewrites to `/api/v1/* → API_ORIGIN`. Point the service-worker caching at `/api/v1`. |
| A2–A5 screen ports | **Done in V0-4 … V0-7** | Don't re-port. Fix only the screens whose data shape changes, and remove v0-only labels ("Heat estimate: OSM", "Simulated device"). |
| A6 translations | **Done in V0-8** | Re-run `npm run i18n:translate` for new strings only. |
| A7 landing | **Done in V0-9** if the design arrived | Update the "NASA data" section once C1–C4 are live. |
| B1–B4 backend | **Not started** | Run as written. Port fixture data from `apps/web/src/lib/data/seed` and `apps/web/src/server/snapshots` as well as from `apps/mobile`. |
| C1–C6 data + AI | **Not started**, but v0 has working TypeScript references | Use `apps/web/src/server/{heat,weather,air,farm,plan,ai}` as references. The OSM heat proxy becomes a **fallback provider** in C1. Port the v0 Ask Atmos system prompt, tools and canned fallback into C6. Keep the SSE event names identical so the v0 UI works unchanged. |
| T1, T2 | Run as written | Also test the **"import my device data"** step: on first real login, v0's IndexedDB goals, trees, actions and photos are uploaded to the API once. Add this as a small task in B3 (endpoint) and in the A1 remainder (client). |
| D1 deploy | Run as written | |

Once v1 is done, delete `apps/web/src/app/api/v0/**`, `apps/web/src/server/**` (after the C prompts have ported what they need) and `src/lib/data/local` (except the import step).

---

## 1. Locked decisions

| Area | Decision |
| --- | --- |
| Frontend | **Next.js rewrite** (App Router, TypeScript strict, Tailwind CSS), one app that holds the **landing page + web app + installable PWA** |
| Expo app | **Removed** after the v0 port. There is no native app; the product is the web app + PWA only. Original code: `git show 9841c47:apps/mobile/<path>` |
| Backend | **FastAPI (Python)** + **Postgres with PostGIS** (local Docker for now). No Supabase. |
| Auth | **Email + password** with an httpOnly JWT cookie. **Guest mode** with tightly restricted features. Schema and interfaces leave room for **Google OAuth later** (not built now). |
| AI | **OpenAI** (tool or function calling, streaming), served from FastAPI |
| Languages | **10 at launch.** `en`, `bn`, `ur` reuse the existing human copy; the other 7 are AI-translated. RTL for `ur` and `ar`. (Default set in §4.6; change it if you want others.) |
| Repo | **Monorepo in this repo**: `apps/web`, `apps/api`, `apps/mobile` |
| Hosting | Later, on the team VPS (`ssh inovate`) with Docker Compose. **Not needed for the MVP**; see §13. |
| Executors | A mix of agents and teammates |

---

## 2. Product brief (what Atmos X is)

Atmos X helps people **cool their own neighbourhood**, using NASA satellite, weather and climate data. It was built for NASA Space Apps 2026, has Bangladesh (Dhaka) as its home story, and works worldwide.

What it must do (this is the pitch, and the MVP has to demonstrate it):

1. **Installable web app (PWA)** that also works as a normal website on desktop.
2. **Scan 100 m – 1 km around you.** It ranks the hottest spots as **hexagon zones**.
3. Each zone has a **Heat Score (0–100)** and a breakdown of **why** it's hot: sealed or concrete surfaces, lack of trees or greenness, dense buildings and population, dark roofs.
4. **How hot is it now?** Air temperature, feels-like, whether it's **above normal** for the date, and a **5-day forecast**. In Bangladesh this uses the **BMD heat-wave levels** (mild 36–37.9 °C, moderate 38–39.9, severe 40–41.9, very severe ≥ 42, based on daily max). Elsewhere it uses the NOAA heat-index bands.
5. **Set a cooling goal** (for example −1.5 °C by 2027) and get an **action plan**: tree planting, cool roofs, shade structures, and water/care needs, **with costs**.
6. **Find empty planting spots and roofs.** It shows future cooling as **two lines, "if you act" vs "if you don't"**.
7. **Work solo, in a team of 2–5, or under an organisation** (school, NGO, city corporation). It includes **photo verification, points, badges and leaderboards** (area, city, country).
8. **Tree care tracking:** each planted tree needs a photo update **every 15 days**. **Nearby nurseries** appear on a map.
9. **Air quality:** PM2.5 and AQI, plus the ability to **connect your own sensor**.
10. **Farmer mode:** crop alerts for **flood, heat, drought, cold wave and lightning**, based on crop and growth stage.
11. **"Ask Atmos"**, an AI chat on **every screen**. It knows which screen you opened it from, answers from Atmos X data with **source chips**, and shows **official warnings first**.
12. **10 languages**, including Bangla and English, usable anywhere in the world.

**Demo story (keep it consistent everywhere):** Nadia Rahman in **Mohammadpur, Dhaka** is cooling the **Asad Gate** block with the **Hall Rooftop Crew** team under the **DU Green Society** org. All of this already exists in `apps/mobile/src/lib/cz/demo.ts`.

---

## 3. Current state of the repo (before Phase 0)

- **Expo SDK 57 / React Native 0.86 / Expo Router**, about 24k lines of TypeScript in `src/`. It was vibe-coded from the **CoolZone** design prototype.
- **Design system:**
  - `src/constants/cz.ts`: light and dark palettes, brand colours `B` (navy `#00182E`, lime `#ACEC00`, blue `#013FF6`), heat and AQI scales, fonts.
  - `src/components/cz/ui.tsx`: an 883-line UI kit (Txt, Tap, cards, chips, gauge, slider and more).
  - `src/components/cz/icons.ts`: SVG path icons.
  - Fonts: Poppins (body), Lemon/Milk (`assets/fonts/LemonMilk.ttf`, display, Latin only), Noto Sans Bengali, Noto Nastaliq Urdu.
- **Screens** live in `src/screens/**`. Routes are thin files in `src/app/**`, and screen IDs map to paths in `src/lib/cz/routes.ts`:

  | ID | Route | Implementation |
  | --- | --- | --- |
  | S01–S03 | onboarding welcome / language / location | `screens/onboarding/*` |
  | S04 | Home tab | `screens/home/{home,sections,score-card,i18n}` |
  | S05 | Map tab | `screens/map/{heat-map,map-copy}` |
  | S06 | Zone detail `/zone/[id]` | `screens/map/zone.tsx` |
  | S07 | Projection (act vs don't act) | `screens/map/projection.tsx` |
  | S08 / S09 | Goal wizard / feasibility | `screens/plan/{goal-wizard,feasibility}` |
  | S10 | Plan tab | `screens/plan/{plan,plan-store,planting-map,copy}` |
  | S11 | Species `/species/[id]` | `screens/plan/{species,species-data}` |
  | S12 / S13 | Nurseries / budget | `screens/act/{nurseries,nursery-data,budget}` |
  | S14 / S15 | Log action (camera) / contribution | `screens/act/{log-action,contribution}` |
  | S16–S19 | Community hub / team / org / create team | `screens/community/*` |
  | S20–S22 | Profile / notifications / settings | `screens/profile/*` |
  | — | Tree `/tree/[id]` | `screens/profile/{tree,trees-common}` |
  | S26–S28 | Air / devices / add sensor | `screens/air/*` |
  | F01–F03 | Farmer home / alert / fields | `screens/farm/*` |
  | S29 | Ask Atmos (floating, every screen) | `components/cz/ask-atmos.tsx` |
  | — | auth, about | `src/app/auth.tsx`, `src/app/about.tsx` |

- **Copy is inline** and spread across screens as `{ en, bn, ur }` objects (`screens/*/i18n.ts`, `copy.ts`, `map-copy.ts`, and inline in components). Number and unit formatting lives in `src/lib/cz/format.ts`.
- **Data is mostly demo.** Only Home's weather and feels-like (Open-Meteo plus the NOAA heat index) and the place name are live. Everything else reads `src/lib/cz/demo.ts`, `screens/*/…-data.ts`, or the synthetic hex field in `src/lib/cz/hex.ts`.
- **Engines that already exist** (TypeScript; port the logic to Python):
  - `src/lib/nasa.ts`: MODIS LST grid via the ORNL web service, NASA POWER daily and climatology, GIBS LST tile URL.
  - `src/lib/heat.ts`: LST anomaly analysis, hot-zone clustering, `planForZone`.
  - `src/lib/farmer.ts`: crops, stages and alert rules.
  - `src/lib/weather.ts`: Open-Meteo forecast and heat index.
  - `src/lib/nurseries.ts`: Overpass.
  - `src/lib/actions.ts`: action types, points, levels, badges.
  - `src/lib/geo.ts`.
- **Database:** `supabase/migrations/20261002000000_atmos_x.sql` defines profiles, clans, clan_members, action_types (with seed points and cooling), action_logs, a scoring trigger, and leaderboard and stats RPCs. Port the **logic**, not the Supabase-specific parts (`auth.uid()`, RLS).
- **Native-only bits** are `expo-location` (`context/location.tsx`) and `expo-camera` (`screens/act/log-action.tsx`). `react-native-maps` is installed but unused; the map is an image plus SVG hexes.
- **Tip:** `cd apps/mobile && npx expo start --web` runs the old app in a browser. Keep it open next to the new one while porting.

---

## 4. Target architecture

### 4.1 Repo layout (after Phase 0)

```
atmos-x/
  apps/
    web/            Next.js: landing + app + PWA       (npm, own package.json)
    api/            FastAPI + worker                   (uv, pyproject.toml)
  docs/
    handoff/        One note per finished prompt
    api-contract.md Human-readable copy of §5, kept in sync with OpenAPI
  docker-compose.yml  postgis (+ api, worker, web profiles later)
  Makefile            make dev | db | api | web | worker | gen-client | test | seed
  .env.example        Points to apps/*/.env.example
  AGENTS.md           Monorepo rules (Expo rules move to apps/mobile/AGENTS.md)
  prompt-v0.md prompt-v1.md DEV-CHECKLIST.md
```

No JS workspaces. `apps/web` and `apps/mobile` each keep their own lockfile, so Expo's Metro resolution doesn't break.

### 4.2 Runtime picture

```
Browser / installed PWA
   │  same-origin: https://host/api/v1/*   (cookies stay first-party, no CORS)
   ▼
Next.js (apps/web, :3000) ──rewrites /api/v1/* ──► FastAPI (apps/api, :8000)
   landing, app UI, SW, manifest                     │  routers → services → providers
                                                     │  OpenAI (Ask Atmos, SSE)
                                                     ▼
                                     Postgres 16 + PostGIS (:5432)
                                     users, teams, actions, trees, goals,
                                     zone/scan cache, data cache, ask logs
                                                     ▲
                       worker (same codebase, APScheduler): refresh caches,
                       pre-compute scans, tree-check reminders, alert generation
                                                     │
                     NASA + open data: Earth Engine (Landsat, HLS, MODIS, CMIP6),
                     Earthdata/CMR/AppEEARS (IMERG, SMAP, ECOSTRESS), POWER,
                     GEOS-CF/FP (OPeNDAP), ORNL MODIS, GIBS, Open-Meteo, OpenAQ,
                     ESA WorldCover, OSM Overpass/Nominatim
```

### 4.3 Frontend stack (`apps/web`)

- **Next.js, latest stable** (check `npx create-next-app@latest` and read the docs for that version; don't rely on memory). Use the App Router, React Server Components where they help, and client components for interactive screens.
- **Tailwind CSS.** CoolZone tokens become CSS variables (`--cz-bg`, `--cz-ink`…) with `[data-theme=dark]`. Use **next-themes** for light/dark/system.
- **next-intl** for 10 locales with ICU messages and RTL via `dir` on `<html>`. Numbers use `Intl.NumberFormat` with the locale's native digits (Bangla digits for `bn`, Extended Arabic-Indic for `ur`, Arabic-Indic for `ar`), matching `format.ts`.
- **TanStack Query** for server state. **openapi-typescript + openapi-fetch** generate a typed client from FastAPI's `/openapi.json` (`make gen-client` writes to `apps/web/src/lib/api/schema.d.ts`).
- **Map: MapLibre GL JS** with keyless vector tiles (OpenFreeMap or another free style; restyle to the navy/lime palette) plus **h3-js** to draw hexes from H3 cell IDs as a GeoJSON fill layer. Add an optional **NASA GIBS LST** raster overlay toggle and OSM attribution.
- **Charts:** hand-written SVG, ported from the RN `react-native-svg` code, which is the closest match to the design. Use Recharts only if something can't be ported quickly.
- **PWA:**
  - `app/manifest.ts`, icons from `apps/mobile/assets/images`, `start_url: /app`, `display: standalone`, theme `#00182E`.
  - A hand-written `public/sw.js` following the Next.js "Progressive Web Apps" guide: app-shell precache, stale-while-revalidate for `GET /api/v1/conditions|zones|air`, and an offline fallback page.
  - An install prompt (`beforeinstallprompt`, with Add to Home Screen instructions for iOS).
  - Web Push is P1 (VAPID), not MVP.
- **Web platform swaps for the native modules:**
  - `expo-location` → `navigator.geolocation`, with a manual city/pin fallback.
  - `expo-camera` → `getUserMedia` in-app camera, with `<input type=file accept=image/* capture=environment>` as fallback. Compress on the client before upload (≤ 1600 px, JPEG 0.8). Send the capture time and GPS.
  - `expo-haptics` → `navigator.vibrate` (no-op where unsupported).
  - `expo-clipboard` → `navigator.clipboard`.
  - Sharing → Web Share API, with copy-link fallback.
  - QR → a `qrcode` / `react-qr-code` package.
  - `expo-sqlite` kv → `localStorage` for guest prefs; server profile for signed-in users.
- **Responsive:** phone-first exactly like the design. **At ≥ 1024 px** the floating pill tab bar becomes a left sidebar, content gets a max width, and the Map screen goes two-pane (map + ranked list). This is the "basic web features" port.

**Routes:**

| Path | Screen |
| --- | --- |
| `/` | Landing (marketing) |
| `/app` | Home |
| `/app/map` | Map |
| `/app/plan` | Plan |
| `/app/community` | Community |
| `/app/profile` | Profile |
| `/app/onboarding/{welcome,language,location}` | Onboarding |
| `/app/zone/[id]`, `/app/zone/[id]/projection` | Zone detail, projection |
| `/app/goal/new`, `/app/goal/[id]/feasibility` | Goal wizard, feasibility |
| `/app/species/[id]` | Species |
| `/app/nurseries`, `/app/budget` | Nurseries, budget |
| `/app/log-action`, `/app/contribution/[id]` | Log action, contribution |
| `/app/team/new`, `/app/team/[id]`, `/app/org/[id]` | Teams and orgs |
| `/app/tree/[id]` | Tree |
| `/app/notifications`, `/app/settings`, `/app/about` | Notifications, settings, about |
| `/app/air`, `/app/air/devices`, `/app/air/add` | Air quality, devices, add sensor |
| `/app/farm/alert/[id]`, `/app/farm/fields` | Farmer alert, fields |
| `/auth/login`, `/auth/register` | Auth |
| `/join/[code]` | Invite landing |

Keep a `routes.ts` with the **same screen IDs** (`S04`, `S06`…) so ported cross-links stay one-to-one.

**Hard rule:** `apps/web` contains **no demo data constants**. Every number on screen comes through `src/lib/api/*` hooks. Demo and fallback data lives **only in the API's fixture provider**. Because of this, the Data + AI phase only touches `apps/api`.

### 4.4 Backend stack (`apps/api`)

- **Python 3.12+**, **uv**, **FastAPI**, **Pydantic v2** + pydantic-settings.
- **Database:** SQLAlchemy 2.0 async + asyncpg, **Alembic** migrations, **PostGIS** (geometry columns and `ST_DWithin` for nearby queries). Store H3 cells as text with an index (Python `h3` v4).
- **Auth:** `pwdlib[argon2]` (or argon2-cffi) and **PyJWT**.
- **HTTP and rate limits:** httpx (async) for outbound calls. `slowapi` or a small Postgres-backed counter for rate limits.
- **Data libraries:** `earthengine-api`, `earthaccess`, `pystac-client` + `planetary-computer` + `rioxarray` (no-account Landsat/WorldCover fallback), `xarray`/`netCDF4` (GEOS-CF/FP and IMERG via OPeNDAP), `numpy`.
- **Photos:** Pillow for EXIF and thumbnails; `imagehash` for duplicate-photo detection (P1).
- **AI:** the `openai` SDK.
- **Worker:** APScheduler in a separate process (`uv run python -m app.worker`) using the same code. No Redis for the MVP.
- **Testing and lint:** pytest + httpx `AsyncClient`, ruff.

Layout:

```
apps/api/app/
  main.py  config.py  db.py  deps.py (current_user, require_user, guest limits)
  models/        SQLAlchemy models
  schemas/       Pydantic request/response models == the contract (§5)
  routers/       auth, me, conditions, zones, goals, plan, species, nurseries,
                 actions, trees, teams, orgs, leaderboard, air, sensors, farm,
                 notifications, ask, meta
  services/      business logic (scoring, levels/badges, verification, plans, projections)
  providers/     one package per data domain, each with `fixture.py` and `live.py`
                 heat/ weather/ air/ farm/ places/ (nurseries, geocode, planting spots)
  engines/       pure science functions (heat score, BMD levels, heat index, AQI,
                 farmer rules, cooling math). Unit-tested, no I/O.
  fixtures/      JSON demo story ported from apps/mobile/src/lib/cz/demo.ts etc.
  worker.py
alembic/  tests/  .env.example  pyproject.toml
```

**Provider pattern:**
- `DATA_MODE=fixture|live|auto`. In `auto`, the live provider is tried first, with a timeout, and the fixture is the fallback.
- **Every data response carries `meta`:**

  ```json
  { "live": true, "generated_at": "...", "sources": [{ "id": "landsat-c2-l2", "name": "NASA/USGS Landsat 9 C2 L2", "url": "...", "as_of": "2026-09-28" }] }
  ```

- The UI's **source chips** and the "live / demo" badge read `meta`.
- **Cache:** a `data_cache(key, value jsonb, fetched_at, ttl)` table, plus scan results in `scans` / `scan_cells`, keyed by H3 cell + radius + date.

**Localisation of server content:** structured server text (causes, alerts, plan steps, badges, notifications) is returned as `{ "code": "cause.sealed_surface", "params": { "pct": 78 } }`. The frontend renders it from the message files. Only Ask Atmos returns free text, written by the LLM in the user's language.

### 4.5 Auth and guest model

- `users` (id, email unique nullable for guests, password_hash nullable, role `user|guest|admin`, display_name, created_at) and `auth_identities` (user_id, provider `password|google`, provider_subject). **Google OAuth slots in later** with no schema change; the routes `/auth/oauth/google/*` exist now and return `501`.
- **Session:** a JWT in an httpOnly, `SameSite=Lax`, `Secure` cookie (when not localhost), named `atmos_session`. It lasts 30 days for users and 7 days for guests. Rotate it on login.
- **Guest:**
  - `POST /auth/guest` creates a guest user with no email. Prefs are kept server-side so they carry over.
  - `POST /auth/upgrade` turns a guest into a full account and **keeps their data**.
  - Guests **can:** see conditions, the map/scan (radius capped at 500 m), zone detail, projection, air, farmer alerts (no saved fields), species, nurseries and leaderboards (read-only); use **Ask Atmos (5 messages/day)**.
  - Guests **can't:** log actions, create or join teams or orgs, create goals, track trees, add sensors, save fields, or get notifications.
  - Blocked actions return **`403 {code: "auth.guest_restricted"}`**, and the UI opens a "Create a free account" sheet.
- **Rate limits:** Ask is 30/day per user and 5/day per guest. Scans are 30/hour per user and 10/hour per guest. Auth endpoints are limited per IP.

### 4.6 Languages

`en` (source), `bn`, `ur` (RTL), `hi`, `ar` (RTL), `es`, `fr`, `pt`, `id`, `zh` (Simplified).

**These 7 additions are a default choice; swap them if the team prefers others, for example `sw`, `ne` or `ta`.**

- `en`, `bn` and `ur` copy comes from the Expo app (written by people; it wins over machine translation).
- The other 7 are generated by `apps/web/scripts/translate.ts` using OpenAI with a glossary. Keep "Atmos X", "Heat Score", "Ask Atmos", "NASA", "BMD", "PM2.5" and "AQI" untranslated, and preserve ICU placeholders. Machine-translated files are marked with `"_meta": {"machine": true}` for later review.
- **Fonts via `next/font`:** Poppins, Noto Sans Bengali, Noto Nastaliq Urdu, Noto Sans Arabic, Noto Sans Devanagari, Noto Sans SC. Lemon/Milk is a local font and **Latin display only**; non-Latin locales fall back to the body face, as `prefs.tsx` does today.

### 4.7 Conventions (every prompt)

- TypeScript strict; no `any` in app code. Python is type-hinted and passes `ruff`.
- Don't commit secrets. `.env*` and `secrets/` are gitignored, and each app has a `.env.example`.
- Every screen ships with **loading, empty, error and guest-restricted states**, plus RTL and dark mode.
- Accessibility: ≥ 44 px touch targets, labels on icon buttons, visible focus, and `prefers-reduced-motion` respected.
- **Definition of done:**
  - Lint, typecheck and tests pass (`npm run lint && npm run typecheck` in web; `uv run ruff check && uv run pytest` in api).
  - The feature works against `DATA_MODE=fixture`.
  - A handoff note is written.
  - Commits are small, with conventional messages.

---

## 5. API contract v1

The API is served at `/api/v1`, and FastAPI's OpenAPI document is the machine source of truth. **B1 implements every endpoint below with fixture data first**, so the frontend can build against real HTTP from hour 3 onward. Shapes are given in TypeScript-ish form; field names are snake_case.

```ts
type Meta = { live: boolean; generated_at: string; sources: Source[] }
type Source = { id: string; name: string; url?: string; as_of?: string }
type I18nText = { code: string; params?: Record<string, string | number> }
type LatLng = { lat: number; lng: number }
type Err = { code: string; message: string }          // non-2xx body
```

**Auth and me**

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register` | `{email,password,display_name,lang}` → `User` (sets cookie) |
| POST | `/auth/login` | `{email,password}` → `User` |
| POST | `/auth/logout` | |
| POST | `/auth/guest` | → `User{role:'guest'}` |
| POST | `/auth/upgrade` | guest → user, keeps data |
| GET | `/auth/oauth/google/start` | **501 for now** |
| GET | `/auth/me` | `User` or 401 |
| GET/PATCH | `/me/profile` | `{display_name, avatar_url, home:LatLng?, radius_m(100–1000), lang, unit:'C'\|'F', area:'metric'\|'imperial', theme:'light'\|'dark'\|'system', farmer_mode, ask_on, onboarded}` |
| GET | `/me/stats` | `{points, level:{level,name_code,min,next}, badges:[{id,emoji,code,earned}], trees, actions, cooling_c, rank_area?}` |

**Heat now (Home)**

`GET /conditions?lat&lng` returns:

```ts
{ place, time, air_c, feels_c, humidity, wind_kmh,
  heat_risk: 'ok'|'caution'|'xcaution'|'danger'|'xdanger',
  bmd_level: null|'mild'|'moderate'|'severe'|'very_severe',
  normal_c, anomaly_c,
  forecast: [{date, tmax_c, tmin_c, feels_max_c, rain_mm, bmd_level, heat_risk}] /*5 days*/,
  warnings: [{source:'BMD'|'local', level, text: I18nText, until}],
  meta }
```

**Zones and map**

- `GET /zones?lat&lng&radius_m` returns:

  ```ts
  { scan: { center: LatLng, radius_m, h3_res, acquired: { lst_date, ndvi_date }, baseline_lst_c },
    hexes: [{ h3, score, lst_c }],
    zones: [{ id, name, score, lst_c, dist_m, rank, near_tie: boolean, centroid: LatLng, h3: string[] }],
    my_zone_id, meta }
  ```

- `GET /zones/{id}` returns:

  ```ts
  { id, name, score, lst_c, air_c, feels_c,
    drivers: { sealed_pct, green_pct, ndvi, dark_roof_pct, pop_density_km2, night_lst_c },
    causes: I18nText[], what_if_green: { add_green_pct, score_after, lst_drop_c },
    history: [{ year, day_lst_c, night_lst_c }] /*~20y*/, meta }
  ```

- `GET /zones/{id}/projection?trees&roof_m2&shade` returns `{ years: number[], without_c: number[], with_c: number[], assumptions: I18nText[], meta }`.
- `GET /zones/{id}/planting-spots` returns GeoJSON FeatureCollection with `kind: 'ground'|'roof'|'roadside'`, `area_m2` and `suitability`.

**Goals and plan**

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/goals` | `{zone_id, target_c, by_date, team_id?}` → `Goal` |
| GET | `/goals/mine`, `/goals/{id}` | `Goal{ id, zone_id, target_c, by_date, progress_pct, modeled_c, team_id, org_id }` |
| GET | `/goals/{id}/feasibility` | `{ feasible: 'yes'\|'stretch'\|'no', needed:{trees, roof_m2, shade}, spots_available:{ground_m2, roof_m2}, notes: I18nText[] }` |
| GET | `/goals/{id}/plan` | ranked actions: `[{ action_type, qty, cooling_c, cost:{amount,currency}, water_l_week, effort, why: I18nText }]`, plus a species shortlist and next task |
| GET | `/budget?goal_id` | cost breakdown by action plus water and care costs |
| GET | `/species?lat&lng`, `/species/{id}` | native species, canopy, cooling, water, cost, planting season |
| GET | `/nurseries?lat&lng&radius_m` | `[{ id, name, location: LatLng, dist_m, phone?, hours?, osm_url }]` + meta |

**Actions and verification**

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/action-types` | ported from `actions.ts` and the SQL seed |
| POST | `/actions` | **multipart:** `action_type, quantity, lat, lng, taken_at, photo, goal_id?, team_id?, note?` → `ActionLog{ id, points, cooling_c, trees, status:'pending'\|'verified'\|'rejected', photo_url }`. Points and cooling are computed **on the server only**. |
| GET | `/actions/mine` | |
| DELETE | `/actions/{id}` | |
| POST | `/actions/{id}/review` | team or org admin: `{approve: boolean}` |

**Auto-verify** an action when: the photo is present, its GPS is within 300 m of the claimed zone or location, `taken_at` is within 24 h, and the photo isn't a duplicate (P1: imagehash). Otherwise the action stays `pending` until a reviewer acts.

**Trees**

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/trees/mine` | `[{ id, species_id, nickname, planted_at, location, last_check_at, next_due_at, status:'ok'\|'due'\|'overdue', health }]` |
| POST | `/trees` | |
| GET | `/trees/{id}` | includes the photo timeline |
| POST | `/trees/{id}/checks` | multipart photo + `health:'healthy'\|'stressed'\|'dead'` + note → points. The next check is due in **15 days**. |

**Community** (teams are 2–5 members; orgs are schools, NGOs and city corporations)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/teams?q` | |
| POST | `/teams` | |
| GET | `/teams/{id}` | stats, members, activity, goal |
| POST | `/teams/{id}/join` | |
| POST | `/teams/join-by-code` | `{code}` |
| DELETE | `/teams/{id}/members/me` | |
| GET | `/teams/{id}/invite` | `{code, url}` (the frontend draws the QR) |
| GET/POST | `/orgs/{id}`, `/orgs` | `{id, name, kind:'school'\|'ngo'\|'city'\|'company'\|'other', teams, totals}` |
| GET | `/leaderboard?subject=user\|team&scope=area\|city\|country&period=week\|month\|all&lat&lng` | |

**Air**

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/air?lat&lng` | `{ pm25, aqi, category, dominant, forecast:[{date, pm25, aqi}], stations:[{name, dist_m, pm25, as_of}], my_sensors:[…], advice: I18nText[], meta }`. AQI uses the **US EPA 2024 PM2.5 breakpoints** (0–9.0 / 9.1–35.4 / 35.5–55.4 / 55.5–125.4 / 125.5–225.4 / 225.5+). |
| GET | `/sensors/mine` | |
| POST | `/sensors` | → `{id, ingest_token}` (shown once) |
| DELETE | `/sensors/{id}` | |
| POST | `/sensors/ingest` | header `X-Sensor-Token`; body `{pm25, pm10?, temp_c?, rh?, ts?}` |

**Farmer**

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/farm/fields` | `{id, name, crop, stage, location, area}` |
| GET | `/farm/alerts?field_id` or `?lat&lng&crop&stage` | `[{ id, hazard:'flood'\|'heat'\|'drought'\|'cold'\|'lightning'\|'rain', level:'danger'\|'warning'\|'watch'\|'info', title:I18nText, body:I18nText, actions:I18nText[], window:{from,to}, sources }]` |
| GET | `/farm/alerts/{id}` | |

**Notifications:** `GET /notifications` and `POST /notifications/read {ids}`. Kinds: tree_due, goal_progress, team_invite, heat_warning, farm_alert, verification.

**Ask Atmos:** `POST /ask` with body `{ message, screen: ScreenId, context?: {zone_id?, tree_id?, field_id?, lat?, lng?}, lang, image?: dataURL }`.
- The response is **SSE**. Events:
  - `warning` (official warnings first)
  - `token`
  - `sources` (Source[])
  - `action` (`{label: I18nText, screen: ScreenId, params}`, which needs a user tap)
  - `done` (`{remaining_today}`)
  - `error`
- `POST /ask/{message_id}/feedback {helpful: boolean}`.

**Meta:** `GET /health` returns `{db, data_mode, providers:{name: 'ok'|'degraded'|'fixture'}}`. `GET /sources` returns the full attribution list.

Any contract change needs a PR that updates `docs/api-contract.md` **and** a re-run of `make gen-client`. Additive changes are fine; renames need the Integrator to approve.

---

## 6. Accounts, keys and env (🧑 start NOW)

> The step-by-step human checklist, with checkboxes and owners, is in **DEV-CHECKLIST.md §3–§4**. This section keeps the summary and the env templates for agents.

Do these in this order, because the first ones take longest to approve. Put secrets **only** in `apps/api/.env` (never in git). Share them with teammates through a password manager, not chat.

| # | What | Needed for | How to get it | Env vars | Blocking? |
| --- | --- | --- | --- | --- | --- |
| 1 | **Google Earth Engine** (noncommercial) | Landsat 30 m LST (Heat Score), HLS NDVI, MODIS 20-year history, WorldCover, CMIP6 | 1) Use a Google account and open console.cloud.google.com → **New project** (e.g. `atmos-x-nasa`). 2) Enable the **Earth Engine API** on it. 3) Register the project for Earth Engine at code.earthengine.google.com/register → *Unpaid usage* → *Academia & research / nonprofit / hackathon* (approval is often immediate but can take hours). 4) **IAM → Service Accounts → Create** (`atmos-ee@…`), and grant the roles **Earth Engine Resource Viewer** + **Service Usage Consumer**. 5) Service account → **Keys → Add key → JSON** → save as `apps/api/secrets/gee-key.json`. 6) Test: `uv run python -c "import ee; ee.Initialize(ee.ServiceAccountCredentials('<sa-email>','secrets/gee-key.json'), project='<project-id>'); print(ee.Number(1).getInfo())"` | `GEE_PROJECT`, `GEE_SERVICE_ACCOUNT`, `GEE_KEY_FILE` | **Yes for real Heat Score.** Fallback below. |
| 2 | **NASA Earthdata Login** | IMERG rain, SMAP soil moisture, MOD11A1 files, AppEEARS (ECOSTRESS), LIS/OTD lightning, GMIS, GPW | 1) Register at urs.earthdata.nasa.gov. 2) **Profile → Generate Token**, copy the bearer token (it expires after about 60 days). 3) **Applications → Authorized Apps → Approve More** and approve **"NASA GESDISC DATA ARCHIVE"** (IMERG). Also approve LP DAAC and NSIDC if they're offered or prompted on first download. 4) Test: `curl -L -H "Authorization: Bearer $EARTHDATA_TOKEN" -o /dev/null -w "%{http_code}" "<a file URL from a CMR search>"` should return 200. | `EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD`, `EARTHDATA_TOKEN` | Yes for farmer rain, drought and lightning. Fallback: Open-Meteo. |
| 3 | **OpenAI API key** | Ask Atmos, translating 7 languages | platform.openai.com → **Billing**: add about $10 of credit → **API keys → Create** (project-scoped). Pick the current recommended model that supports tool calling and vision, and a cheaper one for translation, from platform.openai.com/docs/models. | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MODEL_CHEAP` | Yes for Ask Atmos and the translations. |
| 4 | **OpenAQ API key** (free) | Measured PM2.5 stations | explore.openaq.org → sign up → account → **API key** (v3 requires it). | `OPENAQ_API_KEY` | No (Open-Meteo AQ gives modelled PM2.5) |
| 5 | **Nominatim / Overpass identity** | Zone names, place names, nurseries, building footprints | No key. Set a real **User-Agent with a team contact email** (required by OSM policy, max 1 request/second to Nominatim, and cache results). | `OSM_USER_AGENT`, `OVERPASS_URL` | No |
| 6 | Docker Desktop on every dev machine | Local Postgres + PostGIS | Install Docker Desktop, then `make db` | `DATABASE_URL` | Yes |
| 7 | JWT secret | Sessions | `openssl rand -hex 32` | `JWT_SECRET` | Yes |
| — | *No account needed* | NASA POWER, GEOS-CF/GEOS-FP (OPeNDAP), ORNL MODIS web service, GIBS tiles, Open-Meteo (forecast and air quality), ESA WorldCover / Landsat via **Microsoft Planetary Computer** STAC, OpenFreeMap tiles | — | — | — |
| later | Google OAuth client, VAPID keys (web push), the VPS `inovate` | Post-MVP | Google Cloud → APIs & Services → Credentials → OAuth client (Web). `npx web-push generate-vapid-keys` | `GOOGLE_OAUTH_*`, `VAPID_*` | No |

**If Earth Engine isn't approved in time:** C1 must use the **no-account route**, Landsat C2 L2 `ST_B10` from **Microsoft Planetary Computer STAC** (`landsat-c2-l2`, signed with the `planetary-computer` package) and `esa-worldcover` from the same STAC. If that also fails, fall back to MODIS 1 km via the ORNL service (already implemented in `nasa.ts`) and mark it `live: true, resolution: '1km'` in `meta`.

`apps/api/.env.example` (B1 creates it):

```env
DATABASE_URL=postgresql+asyncpg://atmos:atmos@localhost:5432/atmos
JWT_SECRET=change-me
COOKIE_SECURE=false
PUBLIC_WEB_ORIGIN=http://localhost:3000
DATA_MODE=auto                 # fixture | live | auto
UPLOAD_DIR=./data/uploads
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_MODEL_CHEAP=
ASK_DAILY_LIMIT_USER=30
ASK_DAILY_LIMIT_GUEST=5
GEE_PROJECT=
GEE_SERVICE_ACCOUNT=
GEE_KEY_FILE=./secrets/gee-key.json
EARTHDATA_USERNAME=
EARTHDATA_PASSWORD=
EARTHDATA_TOKEN=
OPENAQ_API_KEY=
OSM_USER_AGENT=AtmosX/0.1 (team-contact@example.com)
OVERPASS_URL=https://overpass-api.de/api/interpreter
# later
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

`apps/web/.env.example`:

```env
API_ORIGIN=http://localhost:8000          # used by next.config rewrites (server side)
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
OPENAI_API_KEY=                           # only for scripts/translate.ts, never shipped to the client
```

**Attribution requirements** (C-track adds them to `/sources` and the About screen):
- NASA datasets by name.
- *"GEOS-FP/GEOS-CF data provided by NASA's Global Modeling and Assimilation Office (GMAO)"*.
- © OpenStreetMap contributors (ODbL) on the map.
- Open-Meteo (CC BY 4.0).
- ESA WorldCover (CC BY 4.0).
- OpenAQ.
- Unsplash photo credits that already exist in `demo.ts`.
- Lemon/Milk is donationware (non-commercial use only).

---

## 7. Plan, dependencies and timeline

```
Phase 0  P0 restructure (30–45 min) ─────────────────────────────┐
                                                                 │
Phase 1  ┌─ A1 web foundation (design system, shell, i18n, PWA) ─┼─► A2 ─┐
(parallel)│                                                      ├─► A3 ─┤
         │                                                       ├─► A4 ─┤──► A6 translations
         │                                                       └─► A5 ─┘
         ├─ B1 api foundation + full contract with fixtures ──► B2 auth ──► B3 domain (community, trees, goals, actions)
         │            └──► gen-client → unblocks real HTTP for A2–A5
         └─ 🧑 §6 accounts
Phase 2  C1 heat ∥ C2 weather/heat-wave/history ∥ C3 air ∥ C4 farmer ∥ C5 planning ∥ C6 Ask Atmos  (all inside apps/api)
         A7 landing (whenever the design arrives) · C7 notifications (P1)
Phase 3  T1 automated e2e (Playwright) ∥ T2 human end-to-end test → fix list → fixes
Later    D1 deploy to `inovate`
```

**Suggested clock** (starting at T0, the moment you begin):

| Time | Frontend | Backend | Data/AI | Humans |
| --- | --- | --- | --- | --- |
| T0–T+0:45 | P0 | P0 | — | §6 accounts (GEE first) |
| T+0:45–T+3 | A1 | B1 | (optional, if you have spare hands: start C2/C4 `engines/` as pure functions with tests) | §6, review A1/B1 |
| T+3–T+8 | A2 ∥ A3 ∥ A4 ∥ A5 | B2 → B3 | C1 ∥ C2 start once B1 is merged | Integrator merges every ~1 h |
| T+8–T+13 | A6, polish, A7 if the design is in | B3 finish, B4 hardening | C1–C6 | Start T2 on fixture data |
| T+13–T+17 | fixes | fixes | finish, switch `DATA_MODE=auto` | T2 full pass on live data |
| T+17+ | buffer, demo recording | | | |

**MVP cut line.** If time runs out, these may stay fixture-backed with a visible "demo data" chip:
- org pages
- the sensor ingest UI
- push notifications
- CMIP6 (use a regional warming delta table instead)
- ECOSTRESS
- TEMPO
- MAIAC haze
- lightning climatology (use the Open-Meteo thunderstorm weather code instead)

**These must be live for the demo:**
- Home conditions (temperature, feels-like, normal/anomaly, 5-day forecast, BMD level)
- the map scan with real LST hexes
- zone drivers (at least sealed % and NDVI)
- goal → plan → log action with photo → points → leaderboard
- tree tracking
- the air quality number
- one farmer alert
- Ask Atmos answering in Bangla

**Demo script** (T2 runs it; it's also the pitch video):
1. Install the PWA on an Android phone.
2. Onboard in বাংলা.
3. Home shows Dhaka live.
4. Map scans 500 m and shows the hottest zone (Asad Gate).
5. Open Asad Gate and see why it's hot.
6. Set a goal of −1.5 °C, check feasibility, and get the plan with cost.
7. Look at planting spots and the "act vs don't act" projection.
8. Log a tree with the in-app camera; it's verified and you get points.
9. Open the team leaderboard.
10. Check air quality.
11. Toggle farmer mode and open the heat alert for Boro rice.
12. Ask Atmos "আমার এলাকা এত গরম কেন?" and get an answer with source chips.
13. Switch to اردو to show RTL.

---

## 8. Phase 0

### P0: Monorepo restructure and guardrails (🤖, 30–45 min, blocks everything)

````text
Read prompt-v1.md §1–§5 first. You are doing Phase 0 for Atmos X: restructure this repo into a
monorepo so a Next.js frontend and a FastAPI backend can be built in parallel by other agents.

Do exactly this, and nothing more:
1. `git mv` the whole Expo app into apps/mobile/: src/, assets/, app.json, eas.json, package.json,
   package-lock.json, tsconfig.json, eslint.config.js, .env.example, supabase/. Keep git history (use
   git mv). Move the current AGENTS.md to apps/mobile/AGENTS.md. Verify that
   `cd apps/mobile && npm install && npx tsc --noEmit` still passes, and that `npx expo start --web`
   boots (stop it after it boots). Fix only path issues caused by the move.
2. Create empty skeleton folders with a README.md stub each: apps/web/, apps/api/, docs/handoff/.
3. Write docs/api-contract.md, copied verbatim from prompt-v1.md §5 (it becomes the living copy).
4. Root docker-compose.yml with service `db` using a postgis/postgis image (Postgres 16 or newer,
   PostGIS 3.4 or newer), user/pass/db = atmos/atmos/atmos, port 5432, named volume, healthcheck.
   Leave commented placeholders for api, worker, and web services (D1 fills them later).
5. Root Makefile with targets: db (docker compose up -d db), api (cd apps/api && uv run fastapi dev
   app/main.py --port 8000), worker, web (cd apps/web && npm run dev), dev (db + api + web together,
   e.g. with a simple `trap`/`&` script or `npx concurrently`), gen-client (curl
   localhost:8000/openapi.json → npx openapi-typescript → apps/web/src/lib/api/schema.d.ts), seed,
   test (api pytest + web lint/typecheck). Targets for apps that don't exist yet may fail; that's fine.
6. Root .gitignore: add .env, .env.local, apps/api/secrets/, apps/api/data/, .venv, __pycache__,
   .next, node_modules, *.log.
7. A new root AGENTS.md (and CLAUDE.md as a one-line pointer to it) for the monorepo. It covers:
   apps and ownership, "apps/mobile is frozen design reference: do not edit except to read",
   §4.7 conventions, the contract rule from §5, the no-demo-data-in-web rule from §4.3, the
   handoff-note rule, and the commands. Keep it under 80 lines.
8. Update the root README.md: short project intro, monorepo layout, quickstart via Make, link to
   prompt-v0.md, prompt-v1.md and DEV-CHECKLIST.md. Mark the old Expo instructions as "apps/mobile (frozen)".
Commit as `chore: restructure into monorepo (apps/web, apps/api, apps/mobile)`. Write
docs/handoff/P0.md.
````

---

## 9. Track A: Frontend (Next.js) 

### A1: Web foundation: scaffold, design system, shell, i18n, PWA (🤖, about 2–2.5 h, blocks A2–A5)

**Owns:** `apps/web/**`, but **only** in `src/components/cz/**`, `src/app/layout*`, `src/app/[locale]/(app)/layout*`, `src/styles`, `src/i18n`, `src/lib/{api,format,routes,prefs}`, `public/`, config files.

````text
Read prompt-v1.md §1–§5 first. Build the foundation of apps/web, the Next.js rewrite of the Atmos X
Expo app in apps/mobile (frozen, read-only, the design source of truth). Other agents will port
screens on top of what you build, in parallel, so the quality and completeness of the shared kit
matters more than anything else here.

1. Scaffold: create-next-app (latest stable; read that version's docs before using any API) with
   TypeScript, App Router, src/ dir, Tailwind, ESLint, alias @/*. Add next-intl, next-themes,
   @tanstack/react-query, openapi-fetch, openapi-typescript (dev), maplibre-gl, h3-js, qrcode
   (or react-qr-code), clsx. Scripts: dev, build, start, lint, typecheck (tsc --noEmit).
   next.config: rewrites /api/v1/:path* → ${API_ORIGIN}/api/v1/:path*, plus /media/:path* the same way.
2. Design tokens: port apps/mobile/src/constants/cz.ts to CSS variables + Tailwind theme:
   LIGHT/DARK palettes, brand colours B, radii R, shadows, heat colour scale (heatColor/heatFg),
   AQI scale, heat-risk colours from apps/mobile/src/lib/cz/live.ts. Dark mode with next-themes
   (class or data-theme), default "system", persisted.
3. Fonts with next/font: Poppins (weights used in cz.ts), Lemon/Milk local
   (copy apps/mobile/assets/fonts/LemonMilk.ttf), Noto Sans Bengali, Noto Nastaliq Urdu, Noto Sans
   Arabic, Noto Sans Devanagari, Noto Sans SC. Body/display font switch per locale exactly like
   apps/mobile/src/context/prefs.tsx (`font()` / `display`).
4. UI kit: port EVERY export of apps/mobile/src/components/cz/ui.tsx and icons.ts to
   src/components/cz/ as DOM + Tailwind React components with the same names and props, so screen
   porters can translate code almost line by line (Txt, Tap, Icon, I, cards, chips, buttons,
   gauge/score ring, slider, inputs, headers, sheets/modals, list rows, empty/error/loading states…).
   Keep the behaviours: ≥44px targets, press feedback, vibrate on primary actions, aria labels,
   RTL-safe logical properties (ms/me/ps/pe, start/end). Add a /dev/kit page that renders every
   component in light and dark, LTR and RTL. Porters use it as their reference.
5. App shell: src/app/[locale]/(app)/app/layout.tsx with the floating pill tab bar from
   apps/mobile/src/app/(tabs)/_layout.tsx (5 tabs; label "Fields" when farmer mode is on). At
   ≥1024px it becomes a left sidebar with max-width content. Add a slot for the floating Ask Atmos
   button (A5 builds the panel; you render a placeholder button that opens an empty sheet).
   Add the guest "Create a free account" sheet, opened by a global `requireAccount()` helper and on any
   403 auth.guest_restricted.
6. Routing helpers: src/lib/routes.ts with the SAME screen IDs as apps/mobile/src/lib/cz/routes.ts
   mapped to the new paths in prompt-v1.md §4.3, plus go(id), goPath(), goBack() (fallback to /app).
   Create every route in §4.3 as a placeholder page ("Screen S06 — ported by A2") so porters only
   fill in files and the layout is never fought over.
7. i18n: next-intl with the 10 locales of §4.6, localePrefix "as-needed", default en, RTL for
   ur/ar via <html dir>. Messages in src/i18n/messages/{locale}/{namespace}.json with one namespace
   per screen group (common, nav, onboarding, home, map, zone, plan, act, community, profile, air,
   farm, ask, auth, landing, server). Write common + nav for en/bn/ur now, taken from the Expo copy.
   Port format.ts into src/lib/format.ts (native digits, °C/°F, distances, dates) on top of Intl.
   Add a renderer for server I18nText {code, params} → t(`server.${code}`, params).
8. Prefs and session: a React context exposing prefs (lang, unit, theme, farmer, askOn, radius,
   area, onboarded), backed by GET/PATCH /me/profile when signed in or a guest, and by localStorage
   before the guest session exists. Changing lang switches the locale route.
   useSession() → /auth/me. On first app visit with no session, call POST /auth/guest automatically.
9. API layer: src/lib/api/client.ts (openapi-fetch with credentials 'include', base '/api/v1'),
   error normaliser (Err {code,message}), and one TanStack Query hook file per domain
   (conditions, zones, goals, plan, actions, trees, teams, orgs, leaderboard, air, sensors, farm,
   notifications, me, auth) with the paths from §5. Until B1's OpenAPI lands, type the hooks
   from the §5 shapes in src/lib/api/types.ts. When `make gen-client` works, switch to the
   generated types and delete the hand-written ones. NO demo data in apps/web.
10. Location: src/lib/location.tsx context replacing apps/mobile/src/context/location.tsx with
    navigator.geolocation, a permission state, a manual "choose on map / search city" fallback
    (Nominatim search through the API is fine later; for now a small list of cities incl. Dhaka),
    and a "focus point" separate from the device position.
11. PWA: app/manifest.ts (name Atmos X, short_name Atmos X, start_url /app, display standalone,
    background/theme #00182E, icons generated from apps/mobile/assets/images/icon.png at 192/512 +
    maskable), public/sw.js per the Next.js PWA guide (precache shell + offline.html,
    stale-while-revalidate for GET /api/v1/{conditions,zones,air,farm/alerts}, network-only for
    everything else), registration in a client component (prod only), an install banner component
    (beforeinstallprompt; iOS instructions), and an offline indicator.
12. Landing placeholder at / (the [locale] root): logo, one-line pitch, "Open the app" → /app,
    "Install". A7 replaces it.
Done when: `npm run build` passes, lint and typecheck pass, /dev/kit renders all components in 4
modes, every route resolves, the PWA is installable on Chrome (Lighthouse installable check), and
docs/handoff/A1.md lists every kit component with its props, plus how porters should use routes,
i18n namespaces, hooks and requireAccount().
````

### Shared instructions for screen porters A2–A5

Put this at the top of A2–A5. It's already referenced from each prompt below.

````text
PORTING RULES (A2–A5)
- Read prompt-v1.md §1–§5 and docs/handoff/A1.md first. Run the old app for visual reference:
  `cd apps/mobile && npx expo start --web`. Match layout, spacing, type, colour, copy and
  interactions of the old screen closely. The CoolZone design is approved; don't redesign it.
- Port each screen from apps/mobile/src/screens/... into the placeholder page A1 created, splitting
  into components under src/components/<area>/. Use only the A1 kit (src/components/cz). If the kit
  lacks something, add it to src/components/<area>/ and note it in your handoff; don't edit the kit.
- Copy: move every user-facing string into src/i18n/messages/{en,bn,ur}/<namespace>.json using
  the existing en/bn/ur text from the Expo files. Add only `en` for any new string (A6 translates).
  No hard-coded strings in TSX.
- Data: replace every import from demo.ts / *-data.ts / hex.ts / live.ts with the hooks in
  src/lib/api. If an endpoint you need is missing from §5, add it to docs/api-contract.md in
  a section "Proposed additions" and tell the Integrator in your handoff note; use the closest
  existing endpoint meanwhile. Never inline demo numbers.
- Every screen: loading skeleton, error with retry, empty state, guest-restricted state via
  requireAccount(), works in dark mode, RTL (ur), and a 360px viewport, and keeps a sensible
  ≥1024px desktop layout. Show source chips from `meta.sources` wherever the old screen showed a
  source or "live" badge, and a "demo data" chip when meta.live === false.
- Stay inside your owned folders. Commit per screen. Write docs/handoff/<id>.md.
````

### A2: Onboarding, Home, Map, Zone, Projection (🤖, about 4 h)

**Owns:** `src/app/[locale]/(app)/app/{page.tsx,onboarding,map,zone}`, `src/components/{onboarding,home,map,zone}`, and the message namespaces `onboarding, home, map, zone`.

````text
[PORTING RULES above]
Port these screens from apps/mobile:
- S01–S03 onboarding (screens/onboarding/{welcome,language,location}.tsx). Language picker shows
  all 10 locales (native names). The location step uses the A1 location context; the radius slider
  is 100–1000 m, saved to prefs.radius. Finishing sets prefs.onboarded and goes to /app. The /app
  layout redirects to onboarding when !onboarded.
- S04 Home (screens/home/{home,sections,score-card}.tsx): GET /conditions for air, feels-like,
  heat-risk band, BMD level pill, "x° above normal", 5-day strip; own-zone Heat Score gauge with
  causes + "+ green" what-if (GET /zones + /zones/{my_zone_id}); hottest zones list; air quality
  card (GET /air); trees needing a photo (GET /trees/mine, status due/overdue, hidden for guests
  with a soft CTA); active goal + next task (GET /goals/mine, /goals/{id}/plan). Official warnings
  banner first when conditions.warnings is non-empty. Farmer mode swaps in the farmer Home: render
  A5's <FarmHome/> if it exists; otherwise a placeholder slot.
- S05 Map (screens/map/heat-map.tsx, map-copy.ts): replace the photo+SVG hex field with MapLibre GL
  (style from NEXT_PUBLIC_MAP_STYLE_URL, restyled toward the navy/lime palette in dark mode).
  Draw GET /zones hexes with h3-js cellToBoundary as a GeoJSON fill layer coloured by the heat scale,
  the scan-radius circle, the user dot, and an outline on the hottest zone. Legend, near-tie flags,
  ranked zone list (bottom sheet on mobile, side panel on desktop), "Rescan" with radius slider,
  optional NASA GIBS LST overlay toggle (tile URL in apps/mobile/src/lib/nasa.ts), OSM attribution.
  Tap a hex or zone → /app/zone/[id]. Farmer mode: show "My fields" (A5 provides the component;
  leave a slot).
- S06 Zone detail (screens/map/zone.tsx): observed vs drivers, causes (I18nText), 20-year history
  chart (port the SVG), what-if, CTA "Set a cooling goal" → /app/goal/new?zone=id, "See projection".
- S07 Projection (screens/map/projection.tsx): two lines "if you act" vs "if you don't" from
  GET /zones/{id}/projection, with sliders for trees / roof m² / shade that refetch (debounced).
Done when all five screen groups work against the fixture API in light/dark, en/bn/ur, mobile/desktop.
````

### A3: Plan and Act (🤖, about 4 h)

**Owns:** `src/app/[locale]/(app)/app/{plan,goal,species,nurseries,budget,log-action,contribution}`, `src/components/{plan,act,camera}`, and the namespaces `plan, act`.

````text
[PORTING RULES above]
Port from apps/mobile:
- S08 Goal wizard (screens/plan/goal-wizard.tsx) → POST /goals (guest → requireAccount()).
- S09 Feasibility (screens/plan/feasibility.tsx) → GET /goals/{id}/feasibility.
- S10 Plan tab (screens/plan/plan.tsx, plan-store.ts, planting-map.tsx, copy.ts): ranked actions
  from GET /goals/{id}/plan, progress, next task, species shortlist, planting-spots map (MapLibre,
  GET /zones/{id}/planting-spots GeoJSON, ground/roof/roadside styling), no-goal empty state → wizard.
  plan-store's local state becomes server state; keep only UI state locally.
- S11 Species (screens/plan/species.tsx; the species-data.ts content moves to the API fixtures, which
  B1 handles; you only consume GET /species/{id}).
- S12 Nurseries (screens/act/nurseries.tsx): MapLibre map + list from GET /nurseries, call and
  directions links (geo: / Google Maps URL), distance in user units.
- S13 Budget (screens/act/budget.tsx) → GET /budget?goal_id.
- S14 Log action (screens/act/log-action.tsx): build src/components/camera/Camera.tsx, an in-app
  camera with getUserMedia (rear camera, capture to canvas), file-input fallback, client-side
  resize/compress, overlay with time + GPS "sealed in", retake/confirm. Then the action type picker
  (GET /action-types), quantity, optional team/goal, note → multipart POST /actions with
  taken_at + lat/lng. Show points awarded and status (pending/verified). Guests → requireAccount().
- S15 Contribution (screens/act/contribution.tsx) → /app/contribution/[id] showing the ActionLog,
  verification status, photo, cooling contributed, share via Web Share API.
Done when a signed-in user can go goal → feasibility → plan → log action with a real camera photo
on a phone (test via `next dev --experimental-https` or a tunnel, since the camera needs HTTPS) →
contribution page, all against the fixture API.
````

### A4: Community, Profile, Trees, Settings, Auth (🤖, about 4 h)

**Owns:** `src/app/[locale]/(app)/app/{community,team,org,profile,tree,notifications,settings,about}`, `src/app/[locale]/{auth,join}`, `src/components/{community,profile,auth}`, and the namespaces `community, profile, auth`.

````text
[PORTING RULES above]
Port from apps/mobile:
- S16 Community hub (screens/community/hub.tsx, data.ts → API): my teams, discover teams
  (GET /teams?q), leaderboards with subject user/team × scope area/city/country × period tabs
  (GET /leaderboard), org cards.
- S17 Team dashboard (screens/community/team.tsx): stats, members (2–5, show the capacity), activity
  feed, shared goal, invite (GET /teams/{id}/invite → link + QR + code + Web Share), leave.
- S18 Org page (screens/community/org.tsx) → GET /orgs/{id}.
- S19 Create team (screens/community/create-team.tsx) → POST /teams; optional org; then invite.
- /join/[code]: invite landing. Explain Atmos X; if guest/not signed in → register/login, then
  POST /teams/join-by-code and go to the team.
- S20 Profile (screens/profile/profile.tsx): level, points, badges (GET /me/stats), my trees
  (GET /trees/mine with 15-day due badges), recent actions, links to notifications/settings/about.
- Tree detail /app/tree/[id] (screens/profile/tree.tsx, trees-common.ts): photo timeline, next due,
  "Add check" → reuse A3's Camera component if it's merged, otherwise a file input → POST
  /trees/{id}/checks with health, and points shown.
- S21 Notifications (screens/profile/notifications.tsx) → GET /notifications, mark read.
- S22 Settings (screens/profile/settings.tsx): language (10), units °C/°F, area units, theme,
  farmer mode, Ask Atmos on/off, scan radius, account (email, upgrade guest, logout), about/sources.
  All write through PATCH /me/profile via the prefs context.
- Auth (apps/mobile/src/app/auth.tsx): /auth/login and /auth/register (email, password with
  strength hint, display name, language), "Continue as guest", "Continue with Google"
  (disabled with a "coming soon" note: OAuth is later), guest-upgrade flow (POST /auth/upgrade)
  that keeps data. Error states for wrong password, email taken, rate limited.
- About (apps/mobile/src/app/about.tsx) + data sources list from GET /sources, NASA/GMAO/OSM credits.
Done when register → join team by code → see the leaderboard → profile shows a badge works on the fixture API.
````

### A5: Air, Farmer mode, Ask Atmos UI (🤖, about 4 h)

**Owns:** `src/app/[locale]/(app)/app/{air,farm}`, `src/components/{air,farm,ask}`, and the namespaces `air, farm, ask`.

````text
[PORTING RULES above]
Port from apps/mobile:
- S26 Air quality (screens/air/air-quality.tsx, i18n.ts) → GET /air: PM2.5, AQI ring with EPA
  2024 category colours, advice (I18nText), 5-day forecast, nearby stations, my sensors.
- S27 Devices (screens/air/devices.tsx) → GET /sensors/mine, delete.
- S28 Add sensor (screens/air/add-sensor.tsx) → POST /sensors; show the ingest token once with
  copy button + a curl example for POST /api/v1/sensors/ingest.
- Farmer mode (screens/farm/{farm-home,fields,alert}.tsx, farm-data.ts → API):
  export <FarmHome/> (field card, crop stage, alerts list) for A2's Home slot, and <MyFields/> for
  the Map slot; /app/farm/fields: list/add/edit fields (crop, stage, pin on MapLibre map) →
  GET/POST /farm/fields (guests can try alerts by lat/lng/crop/stage without saving);
  /app/farm/alert/[id] → GET /farm/alerts/{id} with hazard icon, level colour, what to do, window,
  sources.
- Ask Atmos (components/cz/ask-atmos.tsx): replace A1's placeholder button with the full panel:
  a bottom sheet on mobile and a right drawer on desktop; knows the current ScreenId and context
  (zone_id/tree_id/field_id from the route); suggestion chips per kind (heat/air/farm/tree, from the
  existing copy); attach a photo (reuse the Camera or file input); streams POST /api/v1/ask over SSE
  (fetch + ReadableStream parser handling the events warning/token/sources/action/done/error);
  renders official warnings first in a distinct style, source chips, action buttons that navigate
  only on tap, the "n of 30 today" counter (5 for guests) and helpful 👍 feedback; "no medical or
  pesticide-dose advice" footer. Hidden when prefs.askOn is false.
  Until B1's /ask stub exists, stream from a local mock in src/components/ask/mock-stream.ts that is
  deleted once B1 lands.
Done when air, farmer mode and Ask (against the B1 stub stream) work in en/bn/ur, light/dark, mobile/desktop.
````

### A6: Translations for all 10 languages (🤖+🧑, about 1.5 h, after A2–A5 are merged)

**Owns:** `src/i18n/messages/**` and `scripts/translate.ts`.

````text
Read prompt-v1.md §1–§5 and §4.6. Write apps/web/scripts/translate.ts (run with `npx tsx`):
reads every en namespace, and for each target locale (hi, ar, es, fr, pt, id, zh, plus filling any
missing bn/ur keys) translates only missing or changed keys with OpenAI (OPENAI_MODEL_CHEAP), in
batches, as JSON in → JSON out, with a system prompt containing: the glossary (keep "Atmos X",
"Heat Score", "Ask Atmos", "NASA", "BMD", "PM2.5", "AQI" untranslated), the tone (short,
plain, friendly, public-safety clarity), ICU placeholder preservation (validate that every
{placeholder} and plural/select structure survives, and retry on mismatch), and a length guideline
(labels ≤ 120% of English where possible). Never overwrite human bn/ur strings. Writes
_meta.machine = true. Also run a script check: every locale has every key (CI-able `npm run
i18n:check`). Run it, then sweep the app in ar and ur for RTL breakage and in hi/zh for font
fallback, and fix layout issues in the shared kit only via a small PR noted for the Integrator.
Ask a human speaker (🧑) to spot-check bn and ur on Home, Map, the Plan wizard and Ask Atmos.
````

### A7: Landing page (🤖+🧑, about 2–3 h, starts when the design is delivered)

**Owns:** `src/app/[locale]/(marketing)/**`, `src/components/landing/**`, and the namespace `landing`.

````text
Read prompt-v1.md §1–§5. The landing design is at: <PASTE FIGMA LINK / IMAGES / CLAUDE DESIGN LINK HERE>.
Treat it as the source of truth for layout and visuals; reuse the A1 tokens, fonts and kit where they
match, and add landing-only components under src/components/landing.
Build the landing page at / for all 10 locales (copy in the `landing` namespace; run A6's script for
the non-en locales). Expected sections unless the design says otherwise: hero with "Open the app" +
"Install app" (PWA install prompt), the problem (urban heat in Dhaka and worldwide), how it works
(scan → understand → plan → act → track), NASA data used (Landsat, HLS, MODIS, POWER, GEOS,
IMERG, SMAP… with short plain explanations), feature grid (heat zones, plan, teams, trees, air,
farmer mode, Ask Atmos, 10 languages), impact/science notes (the cooling figures from README),
team + NASA Space Apps 2026 credit, footer with data attributions. Mostly static RSC, images via
next/image, Lighthouse ≥ 90 for performance, accessibility and SEO on mobile; metadata, Open Graph image
(next/og), hreflang alternates for all locales, sitemap.ts and robots.ts.
````

---

## 10. Track B: Backend (FastAPI + Postgres)

### B1: API foundation and the full contract with fixtures (🤖, about 2.5–3 h, blocks gen-client and B2/B3/C*)

**Owns:** `apps/api/**`.

````text
Read prompt-v1.md §1–§5 first. Build apps/api, the FastAPI backend for Atmos X. Your top priority is
that EVERY endpoint in §5 exists, validates input, and returns realistic fixture data matching the
contract within ~2 hours, because four frontend agents are building against it in parallel. Depth
comes later (B2, B3, C*).

1. Project: uv init (Python 3.12+), deps per §4.4 (leave the heavy data libs, earthengine-api,
   earthaccess, xarray, rioxarray, pystac-client, planetary-computer, h3, as an optional extra group
   `data` installed by default but imported lazily so the API boots without credentials).
   Layout exactly as §4.4. config.py with pydantic-settings reading .env; .env.example from §6.
   CORS: allow PUBLIC_WEB_ORIGIN with credentials (dev convenience; prod is same-origin).
   Prefix all routers with /api/v1. Static /media for UPLOAD_DIR.
2. Database: async SQLAlchemy + asyncpg + Alembic (async template). Enable postgis extension in the
   first migration. Models and tables:
   users, auth_identities, profiles (prefs incl. home geography(Point), radius_m, lang, unit, area,
   theme, farmer_mode, ask_on, onboarded),
   teams (name 3–60, code unique 6-char, org_id, owner_id, max_members=5, is_public, area/city/country),
   team_members (team_id, user_id, role owner|admin|member, joined_at; enforce ≤5 in service + DB
   trigger), orgs (name, kind, city, country, verified), org_members,
   action_types (seed from apps/mobile/supabase/migrations/20261002000000_atmos_x.sql + any extra
   types in apps/mobile/src/lib/actions.ts), action_logs (as in the SQL + status, photo_path,
   photo_hash, taken_at, location geography, goal_id, team_id, verified_by, verified_at),
   goals, trees, tree_checks, sensors (ingest_token_hash), sensor_readings, farm_fields,
   notifications, ask_messages (user_id, screen, question, answer, sources jsonb, tokens, helpful),
   usage_counters (subject, key, day, count) for rate limits, data_cache (key pk, value jsonb,
   fetched_at, expires_at), scans (center geography, radius_m, h3_res, acquired jsonb, created_at),
   scan_cells (scan_id, h3, score, lst_c, drivers jsonb), zones (id slug, name, centroid, h3 text[],
   latest score/lst, drivers jsonb).
   Scoring stays SERVER-SIDE: port the score_action_log trigger logic into services/scoring.py
   (points = type.points*qty, cooling = cooling_per_unit*qty, trees = qty if is_tree) and never
   trust client values. Port leaderboard/stats RPC logic (get_user_leaderboard, get_clan_leaderboard,
   get_my_stats, get_clan_stats, period_start) to SQL in services/leaderboard.py, adding area/city/
   country scopes (by profile home location → reverse-geocoded city/country stored on profile).
3. Fixtures: port the demo story into app/fixtures/*.json: apps/mobile/src/lib/cz/demo.ts (user,
   zones, MY_ZONE, GOAL, trees, PM_NOW…), screens/community/data.ts, screens/farm/farm-data.ts,
   screens/plan/species-data.ts, screens/act/nursery-data.ts, map/projection numbers, air numbers.
   Translate display text into I18nText codes where §4.4 requires it, and list every code you invent
   in docs/handoff/B1.md (the frontend adds the strings). `make seed` loads the demo
   user nadia@demo.atmos / demo1234, team Hall Rooftop Crew, org DU Green Society, trees, goal,
   action logs and a handful of rival users/teams so leaderboards look alive.
4. Providers: providers/{heat,weather,air,farm,places}/ each with an interface (Protocol), a
   fixture implementation (returns fixture JSON, re-centred on the requested lat/lng where it makes
   sense, e.g. hexes generated around the point with the old synthetic hex logic from
   apps/mobile/src/lib/cz/hex.ts but as real H3 cells), and an empty live.py raising
   NotImplementedError. A resolver picks per DATA_MODE (auto = live with timeout → fixture).
   Every response includes meta (live, sources, generated_at).
5. Routers: implement ALL endpoints in §5 with request validation and response_model, backed by
   fixtures/DB. Auth can be a minimal stub here (B2 replaces it): get_current_user dependency that
   reads the cookie if valid, otherwise lets endpoints that need it return 401. /ask streams a
   canned SSE answer in the requested lang with warning → tokens → sources → action → done so A5 can
   build the UI (C6 replaces it).
6. OpenAPI: stable operationIds (e.g. zones_list, zones_get), tags per router, examples on schemas.
   Make sure `make gen-client` produces a clean schema.d.ts. Commit the generated file in
   apps/web/src/lib/api/schema.d.ts (that one file is the only thing you touch in apps/web).
7. Tests: pytest smoke test that hits every GET endpoint with fixture mode and validates the response
   model; auth-required endpoints return 401 without a cookie.
Done when `make db && make seed && make api` serves /docs with every §5 endpoint, the tests pass,
gen-client works, and docs/handoff/B1.md documents run commands, seeded accounts and I18nText codes.
````

### B2: Auth, sessions, guest mode, rate limits (🤖, about 2 h, after B1)

**Owns:** `apps/api/app/{routers/auth.py,routers/me.py,services/auth*,deps.py}`, plus auth-related migrations and tests.

````text
Read prompt-v1.md §1–§5 (especially §4.5) and docs/handoff/B1.md. Implement real auth in apps/api:
- POST /auth/register: email normalised and unique, password ≥ 8 chars, argon2id hash, creates
  user + auth_identities(provider=password) + profile with lang; sets the cookie.
- POST /auth/login: constant-time verify, generic error ("auth.invalid_credentials"), rehash if
  argon2 parameters changed; POST /auth/logout clears the cookie.
- JWT (HS256, JWT_SECRET) carrying sub, role, iat, exp, jti; cookie atmos_session httpOnly,
  SameSite=Lax, Secure when COOKIE_SECURE, Path=/; 30 days users, 7 days guests; sliding refresh
  when < 50% lifetime remains.
- POST /auth/guest creates role=guest user + profile; POST /auth/upgrade converts the current guest
  to a full user in place (same user id, so all data is kept); 409 if the email is taken.
- /auth/oauth/google/start and /callback return 501 {code:"auth.oauth_not_enabled"}, but write the
  OAuthProvider interface + auth_identities usage so Google is a drop-in later (comment where).
- deps: current_user (optional), require_user (401), require_full_user (403
  auth.guest_restricted for guests), require_team_role(team, roles).
  Apply guest restrictions exactly per §4.5 to all routers (scan radius cap 500 m for guests).
- Rate limits via usage_counters (atomic upsert): ask 30/day users, 5/day guests; scans 30/h users,
  10/h guests; register/login 10 per 15 min per IP (429 {code:"rate_limited", retry_after}).
- /me/profile GET/PATCH with validation (radius 100–1000, lang in the 10 locales…).
- Tests: register/login/logout, wrong password, guest flow, guest restricted endpoints (403),
  upgrade keeps data, rate limit returns 429, cookie flags.
````

### B3: Domain logic: actions, verification, trees, goals, teams, orgs, leaderboards, badges, notifications (🤖, about 3–4 h, after B2)

**Owns:** `apps/api/app/{services,routers}` for those domains, plus related migrations and tests.

````text
Read prompt-v1.md §1–§5 and docs/handoff/{B1,B2}.md. Replace the fixture-backed domain endpoints with
real Postgres logic (keep fixtures only for the demo seed):
- Photos: POST multipart → validate MIME/size (≤ 8 MB), strip EXIF GPS from the stored public copy
  but record taken_at/lat/lng (from the form and from EXIF if present), save original + 1080px
  JPEG + 320px thumb under UPLOAD_DIR/<yyyy>/<mm>/<uuid>.jpg, store a perceptual hash (imagehash)
  for duplicate detection. Serve via /media. Behind a Storage interface so S3/MinIO can come later.
- Actions: POST /actions computes points/cooling/trees in services/scoring.py; auto-verification
  rules from §5 (within 300 m of the goal zone centroid or the given location, taken within 24 h,
  not a duplicate hash for the same user/team); else pending → POST /actions/{id}/review by
  team/org admin. Only verified actions count for leaderboards; pending shows as provisional on
  the profile. Logging a plant_tree action with a photo also creates a trees row.
- Trees: next_due_at = last check + 15 days; status ok/due (≤2 days)/overdue; checks award points
  (water_tree type); dead trees stop counting cooling.
- Goals: create/list/get; progress_pct and modeled_c computed from verified actions in the zone
  (cooling math from apps/mobile/src/lib/heat.ts + actions.ts; C5 refines the plan engine).
- Levels and badges: port levelFor and badgesFor from apps/mobile/src/lib/actions.ts to
  services/progress.py; return name/badge codes as I18nText codes.
- Teams/orgs: create, code generation (6 chars, no ambiguous characters), join by id/code with the
  ≤ 5 member limit, leave (ownership transfer or delete if last), invite payload {code, url =
  PUBLIC_WEB_ORIGIN/join/<code>}, org create/get with aggregated totals.
- Leaderboards: user/team × area (within 3 km of the requester's home/lat-lng)/city/country ×
  week/month/all, top 50 + "you" row.
- Notifications: rows created for tree_due (worker job daily), verification result, team invite
  accepted, goal milestones (25/50/75/100%), heat_warning/farm_alert (C-track jobs write these).
- worker.py: APScheduler with jobs: tree-due notifications (daily), cache cleanup (hourly), and
  registration hooks for C-track jobs.
Tests for scoring, verification rules, member limit, leaderboard ordering, tree due logic.
````

### B4: API hardening and dev experience (🤖, about 1 h, after B3)

````text
Read prompt-v1.md §1–§5. Harden apps/api: consistent error envelope {code,message} for all errors
(including validation → code "validation_error" with field details), request ID + structured JSON
logging, timeouts and retries (tenacity) on all outbound httpx calls with a per-provider circuit
breaker that marks /health providers degraded, gzip, pagination (cursor) on list endpoints, DB
indexes for every query in leaderboards/nearby/trees-due (EXPLAIN them), and a Dockerfile (uv,
multi-stage, non-root) for later deployment. Re-run gen-client and confirm the web typecheck still
passes; list any contract diffs in docs/handoff/B4.md.
````

---

## 11. Phase 2: Data and AI integration (Track C, all inside `apps/api`)

Each C prompt implements the **live provider** for one domain behind the existing interface. **No contract changes** unless they're additive. Each one keeps the fixture fallback, fills `meta.sources` honestly, caches aggressively in `data_cache`, and adds tests built on recorded HTTP responses (save the samples in `tests/data/`, and never hit the network in CI). Results go in `engines/` (pure functions) plus `providers/<domain>/live.py` (I/O).

**Feature → data map:**

| Feature | Primary (NASA first) | Fallback | P | Prompt |
| --- | --- | --- | --- | --- |
| Hex LST, Heat Score | Landsat 8/9 C2 L2 `ST_B10` (GEE `LANDSAT/LC0{8,9}/C02/T1_L2`), 30 m | Planetary Computer `landsat-c2-l2`, then MODIS 1 km via ORNL | P0 | C1 |
| Greenness / NDVI | HLS v2.0 (GEE `NASA/HLS/HLSL30/v002`, `HLSS30/v002`) | Landsat SR NDVI, then Sentinel-2 via Planetary Computer | P0 | C1 |
| Sealed surface / land cover | ESA WorldCover 10 m (GEE `ESA/WorldCover/v200`) + SEDAC GMIS | OSM buildings + roads density | P0/P1 | C1 |
| Population density | SEDAC GPWv4 (GEE `CIESIN/GPWv4_11/...`) | WorldPop on GEE | P1 | C1 |
| Night heat, 20-year history, trend | MODIS MOD11A1/A2 V061 (GEE `MODIS/061/MOD11A1`) | ORNL MODIS web service (existing code) | P0 | C2 |
| Air temp now, 5-day forecast | NASA GEOS-FP (OPeNDAP), plus Open-Meteo for hourly "now" | Open-Meteo only | P0 | C2 |
| Normal for the date / anomaly | NASA POWER climatology + daily (`/api/temporal/daily/point`) | — | P0 | C2 |
| Future warming (projection) | NEX-GDDP-CMIP6 (GEE `NASA/GDDP-CMIP6`, ssp245/ssp585) | regional delta table | P2 | C2/C5 |
| PM2.5 now + 5-day forecast | NASA GEOS-CF (OPeNDAP) | Open-Meteo Air Quality (CAMS) | P0 | C3 |
| Measured PM2.5 | OpenAQ v3 stations + user sensors | — | P1 | C3 |
| Rain / flood | GPM IMERG V07 Early (GES DISC, Earthdata) + Open-Meteo forecast | Open-Meteo | P0 | C4 |
| Drought onset | SMAP L4 SPL4SMGP (NSIDC, Earthdata) + POWER rain deficit | POWER rain deficit + ET0 from Open-Meteo | P1 | C4 |
| Lightning | LIS/OTD HRMC climatology (GHRC) + Open-Meteo thunderstorm codes | weather codes only | P1 | C4 |
| Cold wave / heat stress | GEOS-FP / Open-Meteo forecast + BMD thresholds | — | P0 | C4 |
| Planting spots, roofs | ESA WorldCover + HLS NDVI + OSM buildings/roads | OSM only | P0 | C5 |
| Nurseries | OSM Overpass (`shop=garden_centre`, `landuse=plant_nursery`, `shop=florist` as low-priority) | fixtures | P0 | C5 |
| Zone and place names | Nominatim reverse geocode (cached) | "Zone N" | P0 | C1 |
| Ask Atmos | OpenAI with tools over the providers above | canned answers | P0 | C6 |

### C1: Heat engine: real hex zones and Heat Score (🤖, about 4–5 h; the most important data prompt)

````text
Read prompt-v1.md §1–§6, docs/handoff/{B1,B3}.md, apps/mobile/src/lib/{nasa,heat,geo}.ts and
apps/mobile/src/lib/cz/hex.ts. Implement providers/heat/live.py + engines/heat.py so
GET /zones, /zones/{id} and the drivers are real.

Pipeline for a scan (lat, lng, radius_m 100–1000):
1. H3 resolution: 11 for radius ≤ 300 m, otherwise 10 (document why: Landsat 30 m pixels per cell).
   Cells = h3 grid_disk covering the circle, clipped to the circle.
2. LST (primary, GEE): Landsat 8+9 C2 L2, the last 120 days (extend to 365 if < 2 clear scenes),
   cloud/shadow mask via QA_PIXEL bits, ST_B10 * 0.00341802 + 149.0 → K → °C, per-pixel median
   composite. Reduce to each H3 cell polygon (mean) with one reduceRegions call per scan (send
   cells as a FeatureCollection; keep it under GEE limits; scale 30). Record acquisition dates.
   Fallback A: Planetary Computer STAC landsat-c2-l2 + rioxarray (same scale/offset), reading only
   the window around the scan. Fallback B: MODIS via ORNL (port fetchLstGrid) → assign the 1 km
   value to cells (meta says resolution 1 km).
3. Drivers per cell: NDVI median from HLS (primary) or Landsat SR; green_pct = share of WorldCover
   tree+shrub+grass classes; sealed_pct = WorldCover built-up share (enrich with GMIS where cheap);
   dark_roof_pct = built-up pixels with low Landsat albedo (approximate shortwave albedo formula;
   document it); pop_density from GPWv4; night_lst from MODIS MOD11A1 night (1 km).
4. Heat Score v1 (0–100, document in engines/heat.py and /sources; weights are config):
   55% day-LST anomaly vs the city baseline (median LST in a 5 km context ring, mapped −3…+8 °C → 0…100),
   15% night LST anomaly, 15% sealed_pct, 10% (1 − green_pct), 5% population density percentile.
   causes[] = the top 3 contributing drivers as I18nText (cause.sealed_surface, cause.low_green,
   cause.dark_roofs, cause.dense_population, cause.hot_nights) with params.
   near_tie = |Δscore| ≤ 3 between neighbouring ranks or overlapping LST uncertainty (±1.5 °C).
   what_if_green: re-score with green_pct + 10 points using the cooling coefficients from
   apps/mobile/src/lib/actions.ts (≈0.1–0.2 °C per +1% canopy per km²).
5. Zones: connected components of cells in the top quartile (port the clustering in heat.ts to
   H3 neighbours), ranked by mean score; name = Nominatim reverse geocode of the centroid
   (neighbourhood/suburb/road, in the request lang when available, cached 30 days), the user's own
   zone = the cell containing the scan centre and its cluster. Stable zone ids (slug of name + h3 parent).
6. History (shared with C2): /zones/{id}.history = yearly hot-season (Mar–May for the northern
   tropics; generalise by latitude: the 3 hottest months in POWER climatology) mean day/night LST
   2003–last year from MODIS MOD11A2 via GEE at the centroid; cache forever per (h3 res-7 parent).
7. Caching: scans keyed by (h3 res-9 of centre, radius bucket, ISO week) in scans/scan_cells and
   zones; a repeat scan within the week is instant. GEE calls have a 25 s timeout → fallback.
   The worker pre-warms the Dhaka demo scan (Mohammadpur 23.7590, 90.3590; 500 m) at startup and daily.
8. Tests: unit tests for the score maths, H3 coverage, clustering; recorded-response tests for
   the GEE wrapper (mock ee.*). A script `uv run python -m app.scripts.scan --lat --lng --radius`
   prints the ranked zones so a human can sanity-check against GIBS/satellite imagery.
Report in docs/handoff/C1.md: sample output for Dhaka, timings, which fallback triggered when.
````

### C2: Weather, heat-wave levels, normals, forecast, history, projection baseline (🤖, about 3 h)

````text
Read prompt-v1.md §1–§6 and apps/mobile/src/lib/{weather,nasa}.ts, apps/mobile/src/lib/cz/live.ts.
Implement providers/weather/live.py + engines/{heatindex,bmd}.py for GET /conditions:
- Now: Open-Meteo current/hourly (temperature, RH, wind) at the point. feels_c = NOAA heat index
  (Rothfusz with the adjustments; port from weather.ts) when T ≥ 26.7 °C, else air temp.
  heat_risk bands as in live.ts.
- 5-day forecast: Open-Meteo daily (tmax/tmin/RH/precip) cross-checked with NASA GEOS-FP via
  OPeNDAP (xarray, nearest grid point, daily max T2M). Use GEOS-FP values when available and show both
  sources in meta. Wrap GEOS-FP in a strict timeout, since it's heavy.
- Normal and anomaly: NASA POWER climatology (T2M_MAX for the month, interpolated to the day of year)
  and POWER daily for the last 30 days; anomaly_c = today's tmax − normal.
- BMD level (only when the point is in Bangladesh, using a simple bbox/polygon check): heat wave by daily
  tmax: mild 36–37.9, moderate 38–39.9, severe 40–41.9, very severe ≥ 42. Cold wave by daily tmin
  (implement BMD thresholds; verify the exact current BMD bands from an official BMD source, note it
  in the handoff, and keep them in config). warnings[]: when the forecast hits moderate+ heat (or
  cold), emit {source:'BMD'} only if a real BMD bulletin is available. Otherwise emit
  {source:'local', text: warn.heatwave_forecast} computed by us, and label it clearly as not
  official. (Investigate whether BMD publishes a machine-readable heat-wave bulletin. If it
  doesn't, don't fake one.)
- Projection baseline for /zones/{id}/projection "without" line: MODIS trend (C1 history linear
  fit) + CMIP6 ssp245 regional delta (GEE NASA/GDDP-CMIP6 ensemble mean of tasmax for 2026→2040
  at the point, cached forever per 0.25° cell). Fall back to a documented regional delta table if GEE
  is unavailable.
- Worker job: for each user's home point (deduplicated to a 0.25° grid), compute tomorrow's levels and
  create heat_warning notifications once per event.
Tests with recorded responses; unit tests for the heat index and BMD banding.
````

### C3: Air quality and sensors (🤖, about 2.5 h)

````text
Read prompt-v1.md §1–§6 and apps/mobile/src/screens/air/*. Implement providers/air/live.py +
engines/aqi.py for GET /air and the sensors endpoints:
- PM2.5 now and the 5-day forecast: NASA GEOS-CF (OPeNDAP, PM25_RH35_GCC or the documented PM2.5
  variable, nearest cell, hourly → daily mean) as the NASA source; Open-Meteo Air Quality (CAMS)
  pm2_5 hourly as the fallback and the "now" value. Report both in meta when both succeed.
- Stations: OpenAQ v3 locations within 25 km with the latest PM2.5 (X-API-Key), the nearest 5.
- Blending for "your PM2.5 now": if a fresh (< 2 h) user sensor or station is within 2 km, show it
  (with its source), else the model value. Port PM_NOW behaviour from demo.ts only as the fixture.
- AQI: US EPA 2024 PM2.5 breakpoints (§5), category codes, advice codes (windows, mask, exercise)
  by category and sensitive groups.
- Sensors: POST /sensors creates a sensor with a random token (store only the hash; show it once);
  POST /sensors/ingest with X-Sensor-Token validates ranges, rate-limits to 1 reading/min, and
  stores the reading; sensors offline > 6 h are flagged. Document a PurpleAir/AirGradient → ingest
  example in the handoff.
Tests for the AQI maths, blending, and token auth.
````

### C4: Farmer alerts (🤖, about 3 h)

````text
Read prompt-v1.md §1–§6 and apps/mobile/src/lib/farmer.ts + apps/mobile/src/screens/farm/farm-data.ts.
Port farmer.ts to engines/farmer.py (crops boro/aman/aus/potato/wheat/jute/vegetables/maize;
stages seedbed/vegetative/flowering/ripening/harvest; existing thresholds) and implement
providers/farm/live.py for GET /farm/alerts:
- Heat stress: forecast tmax vs crop/stage thresholds (e.g. rice flowering > 35 °C → sterility
  risk) using C2's forecast.
- Cold wave: forecast tmin vs crop/stage (boro seedbed cold injury), BMD cold-wave bands from C2.
- Flood / heavy rain: GPM IMERG V07 Early (daily and 30-min via earthaccess/CMR + OPeNDAP or
  subset; GES DISC needs the Earthdata app approval in §6) for the last 72 h accumulation + Open-Meteo
  precipitation forecast for the next 72 h; thresholds per BMD heavy-rain categories (verify them).
- Drought: SMAP L4 SPL4SMGP surface soil moisture percentile vs the day-of-year climatology (or
  POWER 30-day rain deficit vs climatology + Open-Meteo ET0 as the fallback).
- Lightning: Open-Meteo thunderstorm weather codes (95/96/99) in the next 48 h, weighted by
  LIS/OTD HRMC monthly flash-rate climatology at the point (download the single climatology file
  once into apps/api/data/static/ and sample it locally).
- Each alert: hazard, level, title/body/actions as I18nText codes (add them to the handoff for
  the frontend), window, sources. The worker creates farm_alert notifications for saved fields.
IMERG and SMAP are heavy: cache per 0.1° cell per day, enforce timeouts, and fall back cleanly.
Tests per hazard rule with fixed inputs.
````

### C5: Planning engine: plan, feasibility, planting spots, projection "with" line, species, nurseries, budget (🤖, about 3 h)

````text
Read prompt-v1.md §1–§6, apps/mobile/src/lib/{heat,actions,nurseries}.ts and
apps/mobile/src/screens/plan/{plan-store,species-data}.ts, apps/mobile/src/screens/act/budget.tsx.
Implement services/plan.py, engines/cooling.py and providers/places/live.py:
- Cooling maths (document every coefficient with its literature source in engines/cooling.py and on
  /sources): trees ≈ 0.1–0.2 °C daytime surface cooling per +1% canopy per km² (~200 mature trees),
  cool roofs ≈ 0.04 °C per 1% of a km², shade structures and green walls from action_types.
  Tree cooling ramps with growth (logistic: ~20% at year 1, ~80% by year 5, 100% by year 8).
- Feasibility: needed trees/roof m²/shade for target_c over the zone area vs the available planting
  spots → yes / stretch / no, with notes.
- Plan: rank actions by °C per cost and per effort, given the available spots; 70/30 trees/roofs
  default (from planForZone) but adapt to roof vs ground availability; next task; species
  shortlist.
- Planting spots: within the zone polygon, ground = WorldCover grass/bare/sparse classes minus
  OSM buildings, roads (buffered by width) and water; roadside = OSM footway/residential roads with
  ≥ 2 m verge (heuristic); roofs = OSM buildings ≥ 50 m² (flag "flat roof likely" for concrete in
  South Asia). Return GeoJSON with area_m2 and suitability (NDVI low + LST high = better).
- Projection "with" line = C2 baseline − cooling from the planned actions over time.
- Species: a curated native-species table per region (start with Bangladesh from species-data.ts:
  neem, krishnachura, jarul, arjun, bokul, mango; add a small generic tropical/temperate/arid set
  so other countries get something), with canopy, cooling, water need, planting season, price
  (BDT for BD, USD elsewhere, configurable).
- Nurseries: Overpass query (shop=garden_centre, landuse=plant_nursery, shop=florist low priority)
  within the radius, cached 7 days, merged with curated fixtures for Dhaka.
- Budget: per-action unit costs + water (litres/week by species and season × local tariff) + care.
Tests for the maths and the feasibility thresholds.
````

### C6: Ask Atmos with OpenAI (🤖, about 3 h)

````text
Read prompt-v1.md §1–§6 (especially §5 /ask) and apps/mobile/src/components/cz/ask-atmos.tsx (the
behaviour spec and canned answers). Replace the B1 canned stream in routers/ask.py with
services/ask.py using the official OpenAI Python SDK (check the current SDK docs for the streaming +
tool-calling API; model from OPENAI_MODEL):
- Tools (each calls our own services/providers, never the open web): get_conditions(lat,lng),
  get_zone(zone_id) / scan_zones(lat,lng,radius_m), get_air(lat,lng), get_farm_alerts(...),
  get_my_trees(), get_tree(tree_id), get_goal_plan(goal_id), find_nurseries(lat,lng),
  get_species(id). Each tool result includes meta.sources, which the service collects into the
  `sources` event.
- Context: the screen id + route context (zone_id/tree_id/field_id) + the user's prefs (lang, units,
  farmer mode) + home location go into the system prompt; prefetch the obviously relevant tool for
  the screen (e.g. zone on S06) to cut latency.
- System prompt rules: answer only from tool data and general well-established safety guidance;
  say clearly when data is missing; official warnings first (send any active BMD/official warning as
  a `warning` event before tokens); no medical diagnosis, no pesticide/chemical doses (refer to the
  local agriculture extension officer / DAE in BD); short answers (≤ 120 words), in the user's
  language and script, with the user's units; suggest at most 2 in-app actions as `action` events
  (screen id + params), never perform them.
- Photo input (tree leaves, crops): pass the image to a vision-capable model with the same rules;
  hedge ("looks like…"), and recommend a photo check in 3 days.
- Limits: usage_counters 30/day user, 5/day guest (the `done` event carries remaining_today), max 6
  turns of history per conversation, input ≤ 1000 chars, image ≤ 4 MB; log to ask_messages with
  token counts; POST /ask/{id}/feedback.
- Failure: on OpenAI error/timeout, stream the closest canned answer from the old ask-atmos.tsx
  copy with a notice event.
- Eval: a pytest-marked (not CI) script with ~20 questions in en/bn/ur across screens, checking:
  answers cite sources, refuse dosage questions, warning first when active, right language.
Document the system prompt and tool schemas in docs/handoff/C6.md.
````

### C7: Notifications and web push (🤖, P1, about 2 h, only if time allows)

````text
Read prompt-v1.md §1–§6. Add Web Push: VAPID keys from env, POST /push/subscribe {subscription},
DELETE /push/subscribe, pywebpush sending for heat_warning, farm_alert, tree_due and verification
notifications (respect quiet hours 22:00–07:00 local). On the web side, extend public/sw.js with
push + notificationclick (deep link to the right screen) and add a settings toggle that requests
permission. Note the iOS requirement (PWA must be installed to the home screen for push).
````

---

## 12. Phase 3: Integration and testing

### T1: Automated end-to-end (🤖, about 2 h, starts once A2–A5 and B3 are merged)

````text
Read prompt-v1.md §1–§7. Add Playwright to apps/web (tests/e2e). Use `make db seed api` with
DATA_MODE=fixture, then the web dev server. Write specs for the §7 demo script steps 2–13
(camera: mock getUserMedia with a fake video stream + fixed geolocation), plus: guest restrictions
(log action → account sheet; Ask limit 5), register → upgrade keeps data, RTL snapshot for ur and
ar on Home/Map, dark mode snapshot, 360px and 1280px viewports, offline (SW serves the shell and
the last conditions), PWA manifest validity. Add `make e2e`. Report failures as a checklist in
docs/handoff/T1.md with screenshots; fix trivial ones and leave the rest for the owners.
````

### T2: Human end-to-end test, MVP sign-off (🧑, about 3 h, two passes: fixture mode, then live mode)

Testers use: an **Android phone (Chrome)**, an **iPhone (Safari)**, and a **desktop browser (Chrome plus Firefox/Safari)**. Log every issue in one shared sheet with the columns *ID · screen · device · steps · expected · actual · severity (blocker/major/minor) · owner prompt (A2…C6) · status*.

**1. Install and shell**
- [ ] Installs as a PWA on Android (install banner) and on iOS (Add to Home Screen). The icon, name and splash look right.
- [ ] Opens straight into `/app` in standalone mode. Back navigation works.
- [ ] With the network off, the app shell and the last conditions still show, and there's an offline indicator.

**2. Onboarding and settings**
- [ ] Language list shows 10 languages. Picking বাংলা makes Home fully Bangla, with Bangla digits.
- [ ] اردو and العربية flip the whole layout RTL with nothing clipped.
- [ ] Location permission: allowing it uses GPS; denying it offers a city fallback.
- [ ] The radius slider saves.
- [ ] °C ↔ °F, theme light/dark/system, farmer toggle and Ask toggle all apply immediately and survive a reload.

**3. Heat now (Home)**
- [ ] Temperature and feels-like are within about 1–2 °C of a trusted weather app for your location.
- [ ] "Above normal" makes sense, and the 5-day forecast is present.
- [ ] In Dhaka during a hot spell, the BMD level pill appears. Outside Bangladesh, no BMD label appears.
- [ ] Source chips are present, and the "demo data" chip shows only in fixture mode.

**4. Map and zones**
- [ ] A 500 m scan in Dhaka (and at your own location) shows hexes within about 30 s the first time, and instantly on repeat.
- [ ] The hottest zones match visibly hot areas (dense roofs and roads, not parks or water). Cross-check with the GIBS overlay or a satellite view.
- [ ] Zone detail shows drivers, causes, the 20-year history and the what-if.
- [ ] The projection sliders move the "act" line.

**5. Plan and act**
- [ ] Guest → Set goal opens the account sheet.
- [ ] After registering, goal −1.5 °C → feasibility → plan with costs (BDT in BD).
- [ ] Planting spots draw on the map.
- [ ] Log action with the in-app camera, on both phones. The time and GPS appear.
- [ ] The action is auto-verified when you're on site, and pending when the GPS is far away.
- [ ] Points appear, and the contribution page can be shared.
- [ ] Nurseries show near you with working directions links.
- [ ] Budget totals add up.

**6. Community**
- [ ] Create a team, then join it from a second account by link, by QR (scanned with the other phone) and by code.
- [ ] A 6th member is refused.
- [ ] Leaderboard tabs (area/city/country × week/month/all) work, and only verified actions count.
- [ ] The org page shows totals.

**7. Trees**
- [ ] A logged tree appears in My trees.
- [ ] Adding a check with a photo awards points, and the next due date is 15 days later.
- [ ] Overdue trees surface on Home and in Notifications.

**8. Air**
- [ ] A PM2.5/AQI value is present, and the category colour matches the EPA 2024 bands.
- [ ] Nearby stations are listed when OpenAQ has any.
- [ ] Add sensor → copy token → `curl` ingest → the reading appears.

**9. Farmer mode**
- [ ] Toggle it on: Home and Map switch.
- [ ] Add a field (Boro, flowering). Alerts appear with plain actions and sources.
- [ ] Each hazard type can be triggered with fixture overrides.

**10. Ask Atmos**
- [ ] It's on every screen and knows the screen ("why is this zone hot?" on S06 answers about that zone).
- [ ] Answers in বাংলা come back in Bangla with source chips.
- [ ] An official warning appears first when one is active.
- [ ] Refuses pesticide doses.
- [ ] Guest limit of 5 and user limit of 30 are enforced.
- [ ] A photo question works.

**11. Desktop**
- [ ] The sidebar layout works, the Map is two-pane, there's no horizontal scroll, and keyboard navigation and focus are visible.

**12. Landing page**
- [ ] Every section matches the design.
- [ ] Language switching works.
- [ ] "Open the app" and "Install" work.
- [ ] Lighthouse mobile scores are ≥ 90 for performance, accessibility and SEO.

**MVP sign-off:** zero blockers, every item in the "must be live" list (§7) passes on live data, and the demo script runs start to finish on one Android phone in under 4 minutes.

---

## 13. Later: deploy to the `inovate` VPS

### D1: Production deploy (🤖+🧑, after MVP sign-off)

````text
Read prompt-v1.md §1–§6. Prepare production deployment to the VPS reachable as `ssh inovate`:
docker-compose.prod.yml with db (postgis, volume, nightly pg_dump to /backups with 7-day
retention), api (B4 Dockerfile, 2 workers), worker, web (Next.js standalone output, Dockerfile), and
Caddy as the reverse proxy with automatic HTTPS (same origin: / → web, /api/v1 and /media → api),
env from /opt/atmos/.env (never in git), the uploads volume, health checks, restart policies,
and log rotation. Makefile targets deploy (rsync/git pull + compose up -d --build + alembic upgrade
head) and logs. Before touching the server: inspect what already runs on inovate (ports 80/443,
existing proxies, disk) and report it to the human. Don't stop or alter existing services without
explicit approval. Docs in docs/deploy.md including the DNS records needed and how to rotate
secrets. Then: Google OAuth (B2 interface), web push (C7), S3/MinIO storage.
````

---

## 14. Assumptions and open items

- **The 7 extra languages** (hi, ar, es, fr, pt, id, zh) are a default. Change §4.6 before A1 starts if you want others.
- **The landing design** isn't in yet. A7 waits for it, and A1 ships a placeholder.
- **BMD:** heat-wave bands are in §2. Cold-wave and heavy-rain bands, and whether BMD has a machine-readable bulletin, must be verified by C2/C4. We never present our own forecast-based warning as "official BMD".
- **The Heat Score weights** in C1 are v1 and transparent. Tune them after looking at real Dhaka output.
- **No native app.** The Expo prototype was removed; the web app + PWA is the only client. A native client could still use the same API later, because the contract is client-agnostic.
- **Costs:** the OpenAI spend for the MVP should stay under about $10 (translations plus Ask testing). Earth Engine noncommercial use is free.
- **Data licences:** NASA data is open. Credit GMAO, OSM (ODbL), Open-Meteo and ESA WorldCover (CC BY 4.0), and OpenAQ. Lemon/Milk is donationware, so it can't be used commercially without donating.
