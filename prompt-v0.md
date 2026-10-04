# Atmos X: v0 build prompts (presentable MVP)

> **Who this is for:** the Atmos X team and the AI coding agents (Claude Code or similar) you hand work to.
> **Goal of v0:** a **working, installable web app + PWA** that looks and feels exactly like the CoolZone design, with a **real OpenStreetMap map**, **real weather and air data**, and **real AI (OpenAI)** filling in where there is no backend yet. It must be ready to **present by Tue 6 Oct 2026**.
> **Not in v0:** NASA data integration, the FastAPI backend, the Postgres database and server accounts. Those belong to **[prompt-v1.md](prompt-v1.md)** (the full MVP).
> **Human tasks** (keys, env, phone setup, presentation prep) are listed in **[DEV-CHECKLIST.md](DEV-CHECKLIST.md)**.

> **The Expo app is gone.** Atmos X ships only as the Next.js web app + PWA. The Expo prototype (`apps/mobile`) was removed after the v0 port. Every "port from `apps/mobile/…`" pointer below refers to it: read the original with `git show 9841c47:apps/mobile/<path>`. Most of that logic now lives in TypeScript in `apps/web/src/server/**` and `apps/web/src/lib/data/**`; prefer those as the reference.

---

## 0. How to use this file

1. Before starting, a human runs through **DEV-CHECKLIST.md §1**: the OpenAI key, Node, and HTTPS for phones.
2. Every agent prompt begins with *"Read `prompt-v0.md` §1–§6 first."* Those sections are the shared context.
3. Run each prompt in **its own git worktree and branch** (`git worktree add ../atmos-<id> -b v0/<id>`), and stay inside the folders that prompt owns.
4. **One human is the Integrator.** They merge in the order shown in §7 and run `npm run dev` plus the smoke path (§10) after every merge.
5. When a prompt finishes, write `docs/handoff/v0-<id>.md` covering what works, what's faked, the commands to run it, and known gaps.
6. Owner tags: 🤖 = agent, 🧑 = human, 🤖+🧑 = agent builds it and a human verifies.

---

## 1. What v0 is (and the rules that follow from it)

**The one-line brief:** port the Expo app (`apps/mobile`, the visual source of truth) into a Next.js web app + PWA. It should look identical and work end to end on a phone and a laptop. Live data comes from **free, keyless sources** (Open-Meteo, OpenStreetMap). Anything that would need a real backend is answered by **OpenAI** or kept in the **browser's own storage**.

**Rules:**

1. **Presentation first.** Every screen in the demo script (§8) must work smoothly on an Android phone (installed PWA) and on a laptop browser, in English and বাংলা, with no dead buttons.
2. **No backend server and no database.** Next.js **route handlers** (`/api/v0/*`) are the only server code. They call free APIs and OpenAI, and the API key never reaches the browser.
3. **User data lives on the device.** That covers the profile, goals, actions, photos, trees, teams the user created, fields, sensors and notifications. It's stored in IndexedDB, and "community" data (other users, teams, orgs, leaderboards) comes from a **seed file** merged with the user's own points.
4. **The data layer is v1-ready.** Screens only talk to `src/lib/data` hooks, whose types mirror the API contract in **prompt-v1.md §5**. In v1 the hook internals change to call FastAPI, and **the screens don't change**.
5. **Be honest in the UI.** Every data card shows **source chips**: "Open-Meteo", "OpenStreetMap", "AI estimate", "Demo community". The heat map says **"Heat estimate: OpenStreetMap land cover + live weather"**. **Don't label anything as NASA data in v0** unless it truly is: the optional GIBS map overlay, and the NASA POWER rainfall input that `farmer.ts` already uses.
6. **The demo must never break.** Every live call has a timeout and falls back to a **recorded snapshot** for the Dhaka demo location (§5.6). There's also a **Presentation mode** that preloads the demo story (§5.5).
7. **AI is used where it makes the product feel real:**
   - Ask Atmos chat (streaming, with tools)
   - "Why is this zone hot?" in plain language
   - Cooling plan details (species, costs, steps)
   - **Photo verification** of logged actions (vision)
   - Tree health from a photo (vision)
   - Species suggestions outside Bangladesh
   - Translating the UI into 10 languages (build time)

   **Numbers that must be consistent** come from deterministic code, not the LLM: Heat Score, cooling °C, tree counts, AQI and alert levels.

---

## 2. Product brief (unchanged from the full plan)

Atmos X helps people cool their neighbourhood. Here's what v0 shows for each feature:

| # | Feature | What v0 shows | Source in v0 |
| --- | --- | --- | --- |
| 1 | Installable web app (PWA) + desktop website | Real install, offline shell | Next.js + service worker |
| 2 | Scan 100 m – 1 km, hottest **hex zones** | Real map, real H3 hexes, ranked zones | OSM land cover + live air temp → heat proxy |
| 3 | **Heat Score** + why it's hot | Score 0–100, drivers, plain-language "why" | Deterministic score + AI explanation |
| 4 | Heat now, vs normal, 5-day forecast, **BMD heat-wave level** | Real | Open-Meteo forecast + 20-year archive |
| 5 | Cooling goal → action plan with costs (trees, cool roofs, shade, water) | Real flow | Deterministic maths + AI details |
| 6 | Planting spots and roofs; **"act vs don't act"** two-line projection | Real map layer + chart | OSM + deterministic projection |
| 7 | Solo / team of 2–5 / org; photo verification, points, badges, leaderboard | Works on the device; seeded community | IndexedDB + seed + **AI photo check** |
| 8 | Tree care every **15 days**; nearby nurseries | Real | IndexedDB + OSM Overpass |
| 9 | PM2.5 / AQI; add your own sensor | Real AQI; sensor is simulated | Open-Meteo Air Quality |
| 10 | Farmer mode: flood, heat, drought, cold-wave and lightning alerts | Real rules on a real forecast | Port of `farmer.ts` |
| 11 | **Ask Atmos** on every screen | Real AI, screen-aware, source chips | OpenAI streaming + tools |
| 12 | **10 languages** | Real | en/bn/ur from the existing copy + 7 AI-translated |

**Demo story:** Nadia Rahman in **Mohammadpur, Dhaka** (23.7590, 90.3590) is cooling the **Asad Gate** block with the **Hall Rooftop Crew** team, part of the **DU Green Society** org. The data is in `apps/mobile/src/lib/cz/demo.ts`.

**Languages:** `en`, `bn`, `ur` (RTL), `hi`, `ar` (RTL), `es`, `fr`, `pt`, `id`, `zh`.

---

## 3. Current repo (read before starting)

**prompt-v1.md §3 describes the repo in full.** Short version:

- Expo SDK 57 app, about 24k lines, still at the repo root until V0-0 moves it to `apps/mobile/`.
- **Screen IDs and their implementation files:**

  | IDs | Screen | Implementation |
  | --- | --- | --- |
  | S01–S03 | Onboarding | `screens/onboarding/*` |
  | S04 | Home | `screens/home/*` |
  | S05 | Map | `screens/map/heat-map.tsx` |
  | S06 | Zone | `screens/map/zone.tsx` |
  | S07 | Projection | `screens/map/projection.tsx` |
  | S08–S11 | Plan | `screens/plan/*` |
  | S12–S15 | Act | `screens/act/*` |
  | S16–S19 | Community | `screens/community/*` |
  | S20–S22 + tree | Profile | `screens/profile/*` |
  | S26–S28 | Air | `screens/air/*` |
  | F01–F03 | Farm | `screens/farm/*` |
  | S29 | Ask Atmos | `components/cz/ask-atmos.tsx` |
  | — | Auth / About | `app/auth.tsx`, `app/about.tsx` |

- Route mapping is in `src/lib/cz/routes.ts`.
- **Design system:** `src/constants/cz.ts` (tokens), `src/components/cz/ui.tsx` (883-line kit), `src/components/cz/icons.ts`. Fonts: Poppins, Lemon/Milk (`assets/fonts`), Noto Bengali, Noto Nastaliq Urdu.
- **Reusable engines** to port to TypeScript server modules:
  - `src/lib/weather.ts`: Open-Meteo + NOAA heat index
  - `src/lib/cz/live.ts`: heat-risk bands
  - `src/lib/farmer.ts`: farmer alert rules
  - `src/lib/nurseries.ts`: Overpass with 3 mirror endpoints
  - `src/lib/heat.ts`: clustering and `planForZone`
  - `src/lib/actions.ts`: points, levels, badges, cooling coefficients
  - `src/lib/cz/format.ts`: native digits and units
  - `src/lib/cz/hex.ts`: synthetic hex field, the last-resort fallback
- **Copy** lives inline as `{en, bn, ur}` objects in `screens/*/i18n.ts`, `copy.ts`, `map-copy.ts` and inside components.
- **The OpenAI key** is currently in the root `.env` (gitignored). V0-0 moves it to `apps/web/.env.local`.
- **Visual reference while porting:** `cd apps/mobile && npx expo start --web`.

---

## 4. Target architecture for v0

### 4.1 Layout

```
atmos-x/
  apps/
    web/                  ← everything in v0 happens here
      src/
        app/
          [locale]/(marketing)/page.tsx       landing
          [locale]/(app)/app/**               the app (routes in §4.3)
          api/v0/**/route.ts                  server route handlers (no [locale])
          manifest.ts
        server/           server-only modules (import 'server-only')
          openai.ts cache.ts ratelimit.ts http.ts
          weather/ air/ heat/ places/ farm/ plan/ ai/ snapshots/
        lib/
          data/
            types.ts      contract types mirroring prompt-v1.md §5
            hooks/        TanStack Query hooks: the ONLY thing screens import for data
            local/        IndexedDB stores (profile, goals, actions, photos, trees, teams, fields, sensors, notifications)
            seed/         demo community + Presentation-mode story (JSON)
          routes.ts format.ts location.tsx prefs.tsx
        components/cz/    ported UI kit
        components/<area>/
        i18n/             next-intl config + messages/{locale}/{namespace}.json
      public/sw.js offline.html icons/
      scripts/            translate.ts, snapshot.ts
    api/                  empty placeholder (v1)
  docs/handoff/
  prompt-v0.md  prompt-v1.md  DEV-CHECKLIST.md  AGENTS.md
```

### 4.2 Stack

- **Next.js, latest stable.** Check `create-next-app@latest` and **read the docs for that version** before using any API; don't rely on memory. Use the App Router, TypeScript strict and Tailwind CSS.
- **Core libraries:** **next-intl** (10 locales, `localePrefix: "as-needed"`; middleware must **exclude `/api`**), **next-themes**, **TanStack Query**.
- **Storage:** **idb-keyval** (or `idb`) for IndexedDB.
- **Map:** **MapLibre GL JS** with **OpenFreeMap** vector tiles (OpenStreetMap data, no key; style URL in env) and **h3-js**. The fallback is raster `tile.openstreetmap.org` with attribution.
- **Server-side geometry:** **@turf/turf** and **rbush** (or `flatbush`).
- **AI:** the official **openai** Node SDK. Read the current OpenAI docs for the streaming + tool-calling API (Responses API vs Chat Completions) and for structured outputs and vision input. Models come from env.
- **Other:** **zod** to validate route-handler input and AI structured output. **qrcode / react-qr-code**.
- **PWA:** `app/manifest.ts` plus a hand-written `public/sw.js`, following the Next.js "Progressive Web Apps" guide.
- **Route handler settings:** `export const runtime = 'nodejs'`. Set `maxDuration` where scans or AI calls can take a while.

### 4.3 App routes

Keep the **same screen IDs** in `src/lib/routes.ts` (`go('S06')` etc.).

| Path | Screen |
| --- | --- |
| `/` | Landing |
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
| `/app/team/new`, `/app/team/[id]`, `/app/org/[id]` | Teams, orgs |
| `/app/tree/[id]` | Tree |
| `/app/notifications`, `/app/settings`, `/app/about` | Notifications, settings, about |
| `/app/air`, `/app/air/devices`, `/app/air/add` | Air, devices, add sensor |
| `/app/farm/alert/[id]`, `/app/farm/fields` | Farmer alert, fields |
| `/auth/login`, `/auth/register` | Auth |
| `/join/[code]` | Invite landing |
| `/dev/kit` | UI kit gallery |

**Responsive:** phone-first, matching the design exactly. **At ≥ 1024 px** the floating pill tab bar becomes a left sidebar, content gets a max width, and the Map goes two-pane (map + ranked list).

**Web swaps for the native modules:**

| Expo module | v0 replacement |
| --- | --- |
| `expo-location` | `navigator.geolocation`, plus a city search fallback |
| `expo-camera` | `getUserMedia` in-app camera, with `<input type=file accept=image/* capture=environment>` as fallback |
| `expo-haptics` | `navigator.vibrate` |
| `expo-clipboard` | `navigator.clipboard` |
| Share | Web Share API |
| `expo-sqlite` kv | IndexedDB |

### 4.4 Data sources and where each piece of data comes from

Screens never call these directly; they only use `src/lib/data/hooks`.

| Data (contract shape from prompt-v1 §5) | v0 implementation | Endpoint / store |
| --- | --- | --- |
| Conditions now, feels-like, heat risk, 5-day forecast | Open-Meteo forecast (`api.open-meteo.com/v1/forecast`), NOAA heat index (port `weather.ts`), bands from `live.ts` | `GET /api/v0/conditions?lat&lng` |
| Normal for the date, anomaly, 20-year history | Open-Meteo **archive** (ERA5, `archive-api.open-meteo.com/v1/archive`), daily tmax/tmin for the last 20 full years, one request cached per 0.1° cell. Normal = mean tmax for day-of-year ±7. History = hot-season (hottest 3 months) yearly mean | Part of conditions and zone detail |
| BMD heat-wave level (Bangladesh only) | Forecast tmax → mild 36–37.9 / moderate 38–39.9 / severe 40–41.9 / very severe ≥ 42 °C. Labelled "based on BMD thresholds, not an official warning" | Part of conditions |
| Place names, city search | Nominatim reverse (≤ 1 req/s, User-Agent with contact email, cached) and Open-Meteo geocoding search | `GET /api/v0/geo/reverse`, `/api/v0/geo/search` |
| **Hex scan: zones, Heat Score, drivers** | **Heat proxy (§5.1):** Overpass land cover (buildings, roads, green, water) + Open-Meteo air temperature → H3 cells → score → clusters. Names come from the nearest named OSM place or road | `GET /api/v0/zones?lat&lng&radius_m`, `GET /api/v0/zones/[id]` |
| "Why is it hot", what-if | Deterministic drivers + AI explanation in the user's language (cached per zone and language) | Part of zone detail |
| Projection (act vs don't act) | Deterministic: archive trend (linear fit, °C/decade) extended to 2040, minus action cooling with tree-growth ramp (§5.3) | `GET /api/v0/zones/[id]/projection?trees&roof_m2&shade` |
| Planting spots and roofs | Overpass: open ground (grass, park, brownfield, school/mosque/temple grounds, unbuilt plots) minus buildings; roofs = buildings ≥ 80 m² | `GET /api/v0/zones/[id]/planting-spots` (GeoJSON) |
| Feasibility, plan, budget | Deterministic maths (port `planForZone` + the `actions.ts` coefficients) + AI structured output for species shortlist, local unit costs, steps and water needs | `POST /api/v0/plan` (the client sends the goal + zone, since goals are local) |
| Species | Curated Bangladesh list from `screens/plan/species-data.ts`. Outside Bangladesh, an AI-generated native shortlist (cached per country/climate) | `GET /api/v0/species?lat&lng`, `/api/v0/species/[id]` |
| Nurseries | Overpass (`shop=garden_centre`, `landuse=plant_nursery`, `shop=florist` as low priority), merged with the curated Dhaka list from `nursery-data.ts` | `GET /api/v0/nurseries?lat&lng&radius_m` |
| Air: PM2.5, AQI, forecast | Open-Meteo Air Quality (`air-quality-api.open-meteo.com/v1/air-quality`, pm2_5 hourly). **AQI is computed by us** with the US EPA 2024 PM2.5 breakpoints (0–9.0 / 9.1–35.4 / 35.5–55.4 / 55.5–125.4 / 125.5–225.4 / 225.5+) | `GET /api/v0/air?lat&lng` |
| Farmer alerts | Port `farmer.ts` as-is: Open-Meteo forecast + its existing keyless NASA POWER 30-day rain input (may be null on failure) + an upstream forecast for haor floods. Add lightning from Open-Meteo weather codes 95/96/99 | `GET /api/v0/farm/alerts?lat&lng&crop&stage` |
| **Photo verification** of a logged action | OpenAI vision: does the photo show the claimed action (sapling planted, white roof, shade structure…)? Plus GPS and time checks (§5.4) | `POST /api/v0/verify-photo` |
| Tree health check | OpenAI vision → healthy / stressed / dead + one tip | `POST /api/v0/tree-check` |
| **Ask Atmos** | OpenAI streaming with tools that call the same server modules (§5.2) | `POST /api/v0/ask` (SSE) |
| Profile/prefs, local "account", goals, actions + photos, trees + checks, own teams, fields, sensors, notifications, Ask usage | **IndexedDB** on the device | `src/lib/data/local/*` |
| Other users, teams, orgs, leaderboards | **Seed JSON** (ported from `demo.ts` + `community/data.ts`) merged with the local user's points | `src/lib/data/seed/*` |
| Sensor readings | Simulated: Open-Meteo PM2.5 with small noise every 5 minutes, labelled "Simulated device (v0)" | local |
| NASA GIBS LST overlay (optional) | Monthly LST tiles (URL in `apps/mobile/src/lib/nasa.ts`); a toggle on the Map | client tile layer |

**Every server response** includes `meta: { live: boolean, generated_at, sources: [{id, name, url?, as_of?}] }`, the same as in v1. `live: false` means a snapshot or fallback was served, and the UI shows a small "cached" chip.

### 4.5 Local "accounts" and guest mode in v0

The login and register UI is the real v1 UI, but in v0 **the account lives on the device**:
- Register stores name, email and language. The password is hashed with WebCrypto PBKDF2 and stored only locally.
- Login switches between local profiles.
- Log out returns to guest.
- "Continue with Google" is shown, disabled, marked "coming soon".

**Guest mode** is the default on first visit, and it is **restricted exactly as in v1**:
- Guests **can:** view everything read-only, scan up to 500 m, see air and farmer alerts without saving fields, and send **5 Ask messages/day**.
- Guests **can't:** log actions, create or join teams, set goals, track trees, add sensors, save fields or get notifications.

Blocked actions open the **"Create a free account"** sheet. The guest's prefs carry over when they register.

### 4.6 Server protections (the key is ours, and the demo URL may be public)

- `OPENAI_API_KEY` is **server-only**. It never appears in `NEXT_PUBLIC_*` or in client bundles; check the built output with grep.
- **Per-device limits:** an anonymous `atmos_device` cookie set by middleware. Limits are kept in memory:
  - Ask: 30/day for a registered local profile, 5/day for a guest. The client sends its profile type, and the server enforces a hard cap of 30.
  - AI photo checks: 20/day.
  - Scans: 30/hour.
- **A global daily AI cap** via `AI_DAILY_REQUEST_CAP` (default 1500). After it's hit, AI endpoints return canned fallbacks.
- **Every outbound fetch** has a timeout (8 s by default, 25 s for Overpass) and one retry on a mirror. Responses are cached in memory (LRU) **and** in `apps/web/.cache/` (JSON files, gitignored) with a TTL:
  - weather: 30 min
  - air: 1 h
  - archive: 30 days
  - Overpass: 7 days
  - AI explanations: 7 days
- **Input validation:** zod on every route handler. Lat/lng ranges, radius 100–1000, images ≤ 4 MB JPEG/PNG/WebP.

### 4.7 Conventions

- TypeScript strict and no `any`. ESLint and `tsc --noEmit` pass. `npm run build` passes.
- No hard-coded user-facing strings in TSX; everything goes in message files.
- Every screen has **loading, error (with retry), empty and guest-restricted states**, and works in **dark mode**, **RTL** (`ur`, `ar`), at **360 px** and at **1280 px**.
- Touch targets ≥ 44 px, aria labels on icon buttons, visible focus, `prefers-reduced-motion` respected.
- Small commits with conventional messages and a handoff note per prompt.

---

## 5. Specs the server and AI prompts share

### 5.1 Heat proxy and Heat Score v0 (`src/server/heat/`)

1. **Grid.** H3 resolution **11** when the radius is ≤ 300 m, otherwise **10**. Cells = `gridDisk` around the centre, clipped to the circle.
2. **Land cover.** One Overpass query for the scan circle plus a 300 m buffer, using the mirrors from `nurseries.ts`:
   - `building=*` polygons
   - `highway=*` lines, buffered by class: motorway/trunk 12 m, primary 10, secondary 8, tertiary 7, residential 5, service and other 3
   - green: `leisure=park|garden|pitch`, `landuse=grass|forest|meadow|recreation_ground|village_green|orchard`, `natural=wood|scrub|grassland|tree_row`, and `natural=tree` nodes counted as 25 m² of canopy each
   - water: `natural=water`, `waterway=riverbank`, `landuse=reservoir|basin`
3. **Fractions per cell.** Sample a 6×6 point grid inside each cell. Use an R-tree index of feature bounding boxes, then `booleanPointInPolygon`. The result is `built_frac`, `road_frac`, `green_frac` and `water_frac`, plus `building_density` = number of buildings per hectare.
4. **Estimated surface temperature** (documented in code; the coefficients are config):
   `est_c = air_c + 9·built_frac + 7·road_frac − 6·green_frac − 8·water_frac + 1.5·min(building_density/40, 1)`.
   For scoring, `air_c` is **today's daytime peak** (Open-Meteo tmax), with full land-cover contrast at any hour, like a daytime satellite pass.
5. **Heat Score:**
   `score = clamp(0, 100, 10 + 85·(built+road) − 50·green − 60·water + 6·min(density/40, 1) + 4·(est_c − median_est_c_of_scan))`, rounded.
   Sealed surface sets the absolute level. Dense Dhaka blocks are about 80 % sealed and score in the 80s–90s; parks score 0–20. Temperature contrast then separates neighbouring blocks.
   Also set the drivers: `sealed_pct = built+road`, `green_pct`, `dark_roof_pct` (an assumed constant per country, flagged "estimate"), `pop_proxy` = building density.
6. **Zones.** Connected components (H3 neighbours) of cells in the scan's top quartile, ranked by mean score. Mark `near_tie` when neighbouring ranks differ by ≤ 2.
   - **Name:** the nearest named OSM `place=neighbourhood|suburb|quarter` or the largest named road in the cluster. If there's none, use "Zone N".
   - **ID:** `z-<h3 cell of the cluster centroid>-<radius bucket>`. Detail must work **statelessly**: recompute or load the scan from the cache using the cell's centre.
   - The user's own zone is the cluster containing the centre cell, or the nearest one.
7. **causes[]** are the top 3 drivers, as I18nText codes (`cause.sealed_surface`, `cause.low_green`, `cause.dense_buildings`, `cause.wide_roads`, `cause.dark_roofs`) with params.
   **what_if_green** re-scores with `green_frac + 0.10`.
   **why_text** is an AI explanation: 2–3 sentences in the requested language, given only the drivers and numbers. It must not invent data.
8. **Fallbacks.**
   - If Overpass fails or times out, use the snapshot (§5.6).
   - If there's no snapshot for this location, generate the synthetic field ported from `apps/mobile/src/lib/cz/hex.ts`, but as real H3 cells around the point, and return `meta.live = false`.

### 5.2 Ask Atmos (`src/server/ai/ask.ts`, `POST /api/v0/ask`)

**Request:**

```json
{ "message": "...", "screen": "S06", "lang": "bn",
  "context": { "lat": 0, "lng": 0, "zone_id": "...", "tree_id": "...", "field_id": "..." },
  "client_state": { "profile": "guest|user", "units": "C", "farmer": false,
                    "trees": [...], "goal": {...}, "visible": {...} },
  "image": "data:image/jpeg;base64,..." }
```

- `client_state` exists because user data is local in v0. The client sends a **compact summary** (≤ 6 KB) of what the screen shows plus the user's trees and goal.
- The last 6 turns are kept client-side and sent as history.

**Response (SSE).** Events, in order:
- `warning`: active heat-wave or farm danger, which **always comes first**
- `token`
- `sources`: Source[] collected from the tool results
- `action`: `{label, screen, params}`, at most 2. Navigation happens **only when the user taps**.
- `done`: `{remaining_today}`
- `error`

**Tools.** Each tool calls our own server modules in-process: `get_conditions`, `scan_zones`, `get_zone`, `get_air`, `get_farm_alerts`, `find_nurseries`, `get_species`. Prefetch the obviously relevant tool for the screen; for example, call `get_zone` on S06.

**System prompt rules:**
- Answer from tool data and the client summary.
- Say so when data is missing.
- Keep answers to ≤ 120 words, in the user's language, script and units.
- No medical diagnosis.
- **No pesticide or chemical doses.** Refer the user to the local agriculture extension office (DAE in Bangladesh).
- No invented numbers.
- In v0, call the heat map an "estimate".

**Vision:** a photo question (leaves, crops, roof) goes to a vision-capable model. Hedge the answer ("looks like…") and suggest a re-check in 3 days.

**Failure:** if OpenAI errors or times out, stream the closest canned answer from `apps/mobile/src/components/cz/ask-atmos.tsx` with a notice.

### 5.3 Cooling maths and projection (`src/server/plan/`)

- **Coefficients** come from `apps/mobile/src/lib/actions.ts` and the README: trees ≈ 0.1–0.2 °C per +1 % canopy per km² (~200 mature trees), cool roofs ≈ 0.04 °C per 1 % of a km².
- **Tree cooling ramps with growth:** 20 % in year 1, 50 % in year 3, 80 % in year 5, 100 % in year 8.
- **Feasibility:** compare the trees, roof m² and shade needed with the available planting spots. Return yes / stretch / no.
- **Plan:** a 70/30 trees/roofs split by default (`planForZone`), adapted to the spots that are available. The AI fills in, as structured output validated by zod:
  - species shortlist (Bangladesh: curated list first)
  - unit costs in local currency (BDT in Bangladesh)
  - watering litres per week
  - 5 concrete steps
  - a care plan

  Everything the AI fills in is marked `estimate: true`.
- **Projection:**
  - `without` = today's normal + archive trend extended to 2040
  - `with` = `without` − the ramped cooling from the chosen actions

### 5.4 Action and photo verification (`POST /api/v0/verify-photo`)

**Input:** image, `action_type`, `quantity`, `taken_at`, `lat`/`lng`, and the target zone centroid.

The result is **verified** when all of these hold:
- The vision model says the photo matches the action with **confidence ≥ 0.6**.
- GPS is within **300 m** of the zone, or a location is provided.
- `taken_at` is within **24 h**.

**Otherwise** the result is **pending** ("A teammate can confirm it"). The response is `{status, confidence, seen: string, reason_code}`.

**Points** are computed locally from the action types table (`actions.ts`); points for **pending** actions are shown as provisional. The photo is stored as a resized ≤ 1600 px JPEG blob in IndexedDB, and the AI only sees a ≤ 768 px copy.

### 5.5 Presentation mode

**Settings → "Presentation mode"** (also enabled by the `?demo=1` query parameter) does the following:
- Loads Nadia's full story into IndexedDB: profile, the Asad Gate goal at 38 %, 4 trees (1 due for a photo), recent actions, membership in the Hall Rooftop Crew, a Boro rice field, and 1 sensor.
- Fixes the focus location to Mohammadpur.
- Turns on cached-first data fetching.

**"Reset demo"** clears it. Leaving the mode restores the user's own data, which is kept in a separate IndexedDB namespace.

### 5.6 Snapshots: the safety net

- `scripts/snapshot.ts` (`npm run snapshot:dhaka`) calls every `/api/v0` GET endpoint for the demo point and radii 300/500/1000 m, in **en and bn**. It saves the responses in `src/server/snapshots/dhaka/*.json`, which are committed.
- The AI explanations for Asad Gate are included in the snapshot.
- Server modules fall back to a snapshot when the live call fails and the request is within 5 km of the demo point. In those cases `meta.live = false`.
- Re-run the script the morning of the presentation; see DEV-CHECKLIST.

---

## 6. Environment (v0)

`apps/web/.env.local` (gitignored; V0-0 creates it by moving the key from the root `.env`):

```env
OPENAI_API_KEY=sk-...                 # already provided; server-only
OPENAI_MODEL=                          # current tool-calling + vision model (check platform.openai.com/docs/models)
OPENAI_MODEL_CHEAP=                    # smaller model for explanations and translations
AI_DAILY_REQUEST_CAP=1500
OSM_USER_AGENT=AtmosX/0.1 (team-contact@example.com)
OVERPASS_URLS=https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter
NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
NEXT_PUBLIC_MAP_STYLE_URL_DARK=        # optional; otherwise restyle liberty at runtime
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEMO_LAT=23.7590
NEXT_PUBLIC_DEMO_LNG=90.3590
```

`apps/web/.env.example` holds the same keys with empty secrets. Nothing else needs an account in v0.

---

## 7. Plan and timeline

```
V0-0 setup (≈45 min) ──┬──► V0-1 UI foundation ─────┬──► V0-4 Home/Map/Zone ─────┐
                       ├──► V0-2 server data + AI ───┤──► V0-5 Plan/Act ──────────┤
                       └──► V0-3 local data + hooks ─┘──► V0-6 Community/Profile ──┼──► V0-8 translations ─► V0-10 presentation hardening ─► V0-T human test ─► rehearse
                                                     └──► V0-7 Air/Farm/Ask UI ──┘     V0-9 landing (when the design arrives)
```

| Time from start | Agents | Humans |
| --- | --- | --- |
| 0:00–0:45 | V0-0 | DEV-CHECKLIST §1, get the landing design |
| 0:45–3:00 | V0-1 ∥ V0-2 ∥ V0-3 | Review the /dev/kit gallery against the Expo app |
| 3:00–7:00 | V0-4 ∥ V0-5 ∥ V0-6 ∥ V0-7 (V0-2 keeps polishing AI and fallbacks) | Integrator merges every ~1 h; try it on a phone over HTTPS |
| 7:00–9:00 | V0-8, V0-9, V0-10 | bn/ur spot-check |
| 9:00–11:00 | fixes | V0-T full pass, then a rehearsal with the demo script |

If time runs short, cut in this order (lowest value first):
1. org page details
2. sensor add flow
3. GIBS overlay
4. desktop two-pane polish
5. the 7 AI languages (en/bn/ur must stay)

**Never cut:** the demo script in §8.

---

## 8. Demo script (the presentation; V0-T runs it)

1. Open the landing page on the laptop, then "Open the app". Show it installing as a PWA on an Android phone.
2. Onboard in **বাংলা**, with location set to Dhaka (or Presentation mode on).
3. **Home:** live temperature, feels-like, BMD-threshold level, "x° above normal", the 5-day forecast, and the own-zone Heat Score.
4. **Map:** a real OpenStreetMap of Mohammadpur. Scan 500 m; the hexes light up and the hottest zone (Asad Gate area) is outlined. Show the ranked list.
5. **Zone:** drivers, the AI "why it's hot" in Bangla, the 20-year temperature history, then the "+ green" what-if.
6. **Projection:** the act vs don't act lines. Move the trees slider.
7. **Set a goal** of −1.5 °C, then feasibility, then a plan with costs in ৳, species, and planting spots on the map.
8. **Log action:** take a photo of a plant with the in-app camera. The AI verifies it, points are added, and the contribution card is shared.
9. **Community:** the team leaderboard with Nadia's points updated, then the invite QR.
10. **Profile:** level, badges, and the tree due for its 15-day photo. Add a check; the AI gives a health verdict.
11. **Air:** PM2.5 and AQI with advice.
12. **Farmer mode:** Boro rice at the flowering stage, and a heat alert.
13. **Ask Atmos:** "আমার এলাকা এত গরম কেন?" Show the streamed answer with source chips, then tap the suggested action.
14. Switch the language to **اردو** to show RTL, and toggle dark mode.

---

## 9. Prompts

### V0-0: Setup: monorepo, Next.js scaffold, env, contracts (🤖, about 45 min, blocks everything)

````text
Read prompt-v0.md §1–§6 first. You are setting up v0 of Atmos X. Do exactly this:
1. Monorepo move (keep history with git mv): move the Expo app (src/, assets/, app.json, eas.json,
   package.json, package-lock.json, tsconfig.json, eslint.config.js, .env.example, supabase/) into
   apps/mobile/. Move AGENTS.md to apps/mobile/AGENTS.md. Check `cd apps/mobile && npm install &&
   npx tsc --noEmit` still passes; fix only path issues caused by the move. Create apps/api/README.md
   ("FastAPI backend: built in v1, see prompt-v1.md") and docs/handoff/.
2. Secrets: the OpenAI key is in the root .env. Create apps/web/.env.local with
   OPENAI_API_KEY copied from it, plus every other key from prompt-v0.md §6 with its default.
   Do NOT print the key in logs or output. Delete the root .env afterwards only if nothing else
   uses it (the Expo app doesn't). Make sure .gitignore covers .env, .env*.local, apps/web/.cache/.
3. Scaffold apps/web with create-next-app@latest (TypeScript, App Router, src/, Tailwind, ESLint,
   alias @/*). Read the docs of the installed Next.js version before configuring anything.
   Install: next-intl, next-themes, @tanstack/react-query, idb-keyval, maplibre-gl, h3-js,
   @turf/turf, rbush, zod, openai, qrcode (or react-qr-code), clsx; dev: tsx, vitest, @types/rbush.
   Scripts: dev, build, start, lint, typecheck, test (vitest run), probe, snapshot:dhaka,
   i18n:translate, i18n:check. The scripts that point at files other prompts create may fail until those land.
4. Create the folder skeleton from prompt-v0.md §4.1 with an index/README stub in each folder, so
   parallel agents never create the same folders.
5. Write src/lib/data/types.ts: TypeScript types for every shape in prompt-v1.md §5 that v0
   uses (Meta, Source, I18nText, LatLng, User/Profile prefs, Conditions, ZonesScan, ZoneDetail,
   Projection, PlantingSpots (GeoJSON), Goal, Feasibility, Plan, Budget, Species, Nursery,
   ActionType, ActionLog, Tree, TreeCheck, Team, Org, LeaderboardRow, Air, Sensor, FarmField,
   FarmAlert, Notification, AskRequest, AskEvent, VerifyPhotoResult, TreeCheckResult) plus the
   v0 route table from §4.4 as a typed const (path + method + request + response type). This
   file is the contract between V0-1, V0-2 and V0-3. Keep names identical to prompt-v1 §5
   (snake_case fields).
6. Root AGENTS.md (≤ 80 lines, CLAUDE.md as a pointer to it): apps and their state (web = v0 active,
   mobile = frozen reference, api = v1), the rules in prompt-v0.md §1 and §4.7, the "screens
   only use src/lib/data/hooks" rule, the server-only rule for OpenAI, the handoff rule, commands.
7. Root README: short intro, layout, "Run v0: cd apps/web && npm i && npm run dev", links to
   prompt-v0.md, prompt-v1.md, DEV-CHECKLIST.md. Old Expo instructions go under "apps/mobile (frozen)".
Commit: `chore(v0): monorepo + Next.js scaffold + data contract types`. Handoff: docs/handoff/v0-0.md.
````

### V0-1: UI foundation: design system, shell, i18n, PWA (🤖, about 2–2.5 h)

**Owns:** `src/components/cz/**`, `src/app/layout*`, `src/app/[locale]/**/layout*`, all placeholder pages, `src/i18n/**` (config plus the `common` and `nav` namespaces), `src/lib/{routes,format,prefs,location}.ts(x)`, `src/app/manifest.ts`, `public/**`, `src/middleware.ts`, and the Tailwind/global CSS.

````text
Read prompt-v0.md §1–§6 first. Build the UI foundation of apps/web, a faithful web port of the
CoolZone design from apps/mobile (read-only). Four agents will port screens on top of your kit in
parallel, so completeness and fidelity of the kit matter most.
1. Tokens: port apps/mobile/src/constants/cz.ts to CSS variables + Tailwind theme (LIGHT/DARK
   palettes, brand B, radii R, shadows, heat colour scale heatColor/heatFg, AQI scale, heat-risk
   colours from apps/mobile/src/lib/cz/live.ts). next-themes with light/dark/system, persisted.
2. Fonts with next/font: Poppins (the weights used), Lemon/Milk local (copy
   apps/mobile/assets/fonts/LemonMilk.ttf; Latin display only), Noto Sans Bengali, Noto Nastaliq
   Urdu, Noto Sans Arabic, Noto Sans Devanagari, Noto Sans SC. Per-locale body/display switching
   like apps/mobile/src/context/prefs.tsx.
3. Kit: port EVERY export of apps/mobile/src/components/cz/ui.tsx and icons.ts into
   src/components/cz/ with the same names and props (DOM + Tailwind), so porters translate almost
   line by line. Keep ≥ 44 px targets, press feedback, navigator.vibrate on primary actions, aria
   labels, RTL-safe logical properties. Add SourceChips (from meta.sources, plus "cached" when
   meta.live === false), Skeleton, ErrorState(retry), EmptyState and a BottomSheet/Drawer.
   Build /dev/kit showing every component in light/dark × LTR/RTL.
4. Shell: app layout with the floating pill tab bar from apps/mobile/src/app/(tabs)/_layout.tsx
   (5 tabs; "Fields" label in farmer mode), which becomes a left sidebar at ≥ 1024 px. A floating
   Ask Atmos button slot (V0-7 fills the panel). A global AccountSheet opened by requireAccount().
   An offline indicator. An install banner (beforeinstallprompt + iOS Add to Home Screen hint).
5. Routing: src/lib/routes.ts with the SAME screen IDs as apps/mobile/src/lib/cz/routes.ts mapped
   to the §4.3 paths; go(id), goPath(), goBack() (falling back to /app). Create EVERY §4.3 route as a
   placeholder page naming its screen ID and owner prompt, so porters only fill files in.
   Onboarding redirect: /app → /app/onboarding/welcome when prefs.onboarded is false.
6. i18n: next-intl, the 10 locales from §2, localePrefix "as-needed", <html dir="rtl"> for ur/ar,
   middleware that skips /api, /_next, static files and sw.js. Messages are stored as
   src/i18n/messages/{locale}/{namespace}.json with these namespaces: common, nav, onboarding,
   home, map, zone, plan, act, community, profile, air, farm, ask, auth, landing, server. Fill
   common + nav for en/bn/ur from the Expo copy. Port apps/mobile/src/lib/cz/format.ts to
   src/lib/format.ts (native digits per locale, °C/°F, distances, dates, currency) using Intl.
   Helper tServer(I18nText) → t(`server.${code}`, params).
7. Prefs and location: a prefs context (lang, unit, area, theme, farmer, askOn, radius 100–1000,
   onboarded, presentation) backed by IndexedDB (idb-keyval). Language changes switch the
   locale route. A location context: navigator.geolocation with permission state, a manual
   city search (calls GET /api/v0/geo/search; until V0-2 lands, fall back to a small static list
   including Dhaka), and a focus point separate from the device position. Presentation mode pins
   the focus to NEXT_PUBLIC_DEMO_LAT/LNG.
8. PWA: app/manifest.ts (name/short_name "Atmos X", start_url /app, display standalone, colours
   #00182E, icons 192/512 + maskable generated from apps/mobile/assets/images/icon.png),
   public/sw.js per the Next.js PWA guide: precache the shell + /offline.html,
   stale-while-revalidate for GET /api/v0/{conditions,air,zones,farm/alerts,nurseries,species},
   network-only for POST and /api/v0/ask. Registration only in production builds.
9. Providers: QueryClientProvider (staleTime 5 min, retry 1), ThemeProvider, NextIntlClientProvider,
   PrefsProvider, LocationProvider in the app layout.
10. Landing placeholder at /: logo (apps/mobile/assets/images/atmosx-logo.png), pitch, "Open the
    app", "Install". V0-9 replaces it.
Done when build/lint/typecheck pass, /dev/kit renders everything in 4 modes, all routes resolve,
the app is installable (Lighthouse PWA installable check), and docs/handoff/v0-1.md documents
every kit component and how porters use routes, i18n namespaces, hooks and requireAccount().
````

### V0-2: Server: live data modules, heat proxy, AI endpoints (🤖, about 3–4 h; runs in parallel with V0-1)

**Owns:** `src/server/**`, `src/app/api/v0/**` and `scripts/snapshot.ts`.

````text
Read prompt-v0.md §1–§6 first (especially §4.4, §4.6, §5). Implement every /api/v0 route handler
in §4.4 using the contract types in src/lib/data/types.ts. Every module goes in src/server with
`import 'server-only'`, and every handler validates input with zod, returns { ...data, meta } and
sets sensible Cache-Control.
Infrastructure (do first): server/http.ts (fetch with timeout, one retry, mirror rotation for
Overpass, User-Agent from OSM_USER_AGENT); server/cache.ts (LRU in memory + JSON files in
apps/web/.cache with TTLs from §4.6; key helpers that round lat/lng to cells); server/ratelimit.ts
(atmos_device cookie set by middleware, or created in the handler if missing; per-device and
global AI caps from §4.6; 429 {code:"rate_limited"}); server/openai.ts (client, model names from env,
helpers for structured output validated with zod and for streaming; read the current OpenAI SDK docs).
Modules:
- weather/: port apps/mobile/src/lib/weather.ts (Open-Meteo forecast, NOAA heat index) and the
  heat-risk bands from apps/mobile/src/lib/cz/live.ts; archive.ts (Open-Meteo archive, 20 full
  years of daily tmax/tmin, cached per 0.1° cell for 30 days) → normal for the date (DOY ±7),
  anomaly, yearly hot-season history, linear trend; bmd.ts (Bangladesh bbox/polygon check +
  heat-wave bands, with the "not official" flag). Endpoint /conditions.
- geo/: Nominatim reverse (rate-limited to 1/s, cached) and Open-Meteo geocoding search.
  Endpoints /geo/reverse, /geo/search.
- heat/: the §5.1 pipeline exactly (Overpass land cover → H3 cells → fractions → est_c → score
  → clusters → names → ids). Endpoints /zones and /zones/[id] (drivers, causes, what_if_green,
  history from weather/archive, why_text from AI via ai/explain.ts, cached per zone+lang).
  Performance target: a 500 m scan in under 12 s cold and under 300 ms warm. Log timings.
- plan/: §5.3. Endpoints /zones/[id]/projection, /zones/[id]/planting-spots (Overpass open
  ground + roofs ≥ 80 m² as GeoJSON with kind/area_m2/suitability), POST /plan (feasibility +
  ranked actions + budget + AI details via structured output, fields marked estimate),
  /species (port apps/mobile/src/screens/plan/species-data.ts for Bangladesh; AI shortlist cached
  per country+climate elsewhere), /species/[id].
- places/: port apps/mobile/src/lib/nurseries.ts + merge with
  apps/mobile/src/screens/act/nursery-data.ts for Dhaka. Endpoint /nurseries.
- air/: Open-Meteo Air Quality pm2_5 (current + 5-day daily mean), EPA 2024 AQI computed by us,
  advice codes by category. Endpoint /air.
- farm/: port apps/mobile/src/lib/farmer.ts and its dependencies (keep the keyless NASA POWER
  rainfall input exactly as the engine uses it, returning null on failure), and add lightning from
  weather codes 95/96/99. Map alert text into I18nText codes where the engine has en/bn text
  (keep both). Endpoint /farm/alerts.
- ai/: ask.ts (§5.2: SSE, tools calling these modules in-process, prefetch per screen,
  warning-first, guardrails, canned fallback ported from
  apps/mobile/src/components/cz/ask-atmos.tsx), explain.ts (zone why_text), verify.ts (§5.4
  vision check; returns {status, confidence, seen, reason_code}), tree-check.ts (vision →
  health + one tip). Endpoints POST /ask, /verify-photo, /tree-check.
- snapshots/: loader + scripts/snapshot.ts per §5.6 (run it and commit the Dhaka snapshots), and
  every module's fallback path using them.
Tests: add vitest with unit tests for heat index, BMD bands, EPA AQI, the §5.1 score maths,
projection ramp, and verify-photo rule logic (mock OpenAI). Write a small `npm run probe` script
that hits each endpoint for Dhaka and prints status + timing + meta.live.
Handoff (docs/handoff/v0-2.md): endpoint list with sample responses, timings, the system prompts,
every I18nText code you emit (porters add the strings), and the OpenAI models chosen.
````

### V0-3: Local data store, seed community, data hooks (🤖, about 2 h; runs in parallel with V0-1 and V0-2)

**Owns:** `src/lib/data/{hooks,local,seed}/**`.

````text
Read prompt-v0.md §1–§6 first (especially §4.4, §4.5, §5.4, §5.5). Build the data layer screens
use, the ONLY data API screens import. Types come from src/lib/data/types.ts.
1. local/: IndexedDB stores via idb-keyval with namespaces "user:<profileId>" and "demo":
   profiles (local accounts: PBKDF2 password hash via WebCrypto, never plain), session (current
   profile or guest), prefs, goals, actions (+ photo blobs, resized ≤ 1600 px JPEG on the client
   before storing), trees + checks (next due = last check + 15 days; ok/due ≤ 2 days/overdue),
   teams the user created or joined (max 5 members, code generation with no ambiguous chars),
   farm fields, sensors (simulated readings per §4.4), notifications (derived: tree due, goal
   milestones 25/50/75/100%, verification results, heat warnings when conditions say moderate+),
   ask usage counter per day. Points/levels/badges: port levelFor, badgesFor and the action types
   table from apps/mobile/src/lib/actions.ts (pending actions = provisional points).
2. seed/: port the demo story from apps/mobile/src/lib/cz/demo.ts, screens/community/data.ts,
   screens/farm/farm-data.ts into JSON: other users, teams, the DU Green Society org, leaderboards by
   area/city/country × week/month/all, and Nadia's Presentation-mode story (§5.5). Leaderboards
   merge the local user's verified points live, so logging an action moves you up the board.
3. hooks/: TanStack Query hooks with the same names they'll keep in v1: useConditions, useZones,
   useZone, useProjection, usePlantingSpots, usePlan (mutation-style query on POST /plan, keyed by
   goal), useSpecies, useNurseries, useAir, useFarmAlerts, useGeoSearch, useMe/useSession, useAuth
   (register/login/logout/continueAsGuest/upgrade keeps guest prefs), useProfile/usePrefs,
   useGoals, useLogAction (verify-photo → store → points → notifications), useTrees,
   useTreeCheck, useTeams/useTeam/useJoinByCode/useInvite, useOrg, useLeaderboard, useFields,
   useSensors, useNotifications, useAskStream (SSE client: fetch + ReadableStream parser for
   warning/token/sources/action/done/error, AbortController, history of 6 turns, builds the
   compact client_state from §5.2). Server-backed hooks call /api/v0/*; local hooks call local/*.
   Guest restrictions from §4.5 enforced here (throw a typed GuestRestricted error the UI maps to
   requireAccount()). Presentation mode switches the namespace and pins the location.
4. Until V0-2 is merged, server hooks may read the committed snapshots if present; otherwise they
   return a clear "not available yet" error. Do not add demo numbers to hooks.
Unit tests (vitest) for points/levels/badges, tree due logic, team member limit, leaderboard merge,
guest restrictions. Handoff: a hook reference table (name → input → output → source).
````

### Porting rules (paste at the top of V0-4 … V0-7)

````text
PORTING RULES
- Read prompt-v0.md §1–§6, docs/handoff/v0-1.md and v0-3.md first. Run the old app as the visual
  reference: `cd apps/mobile && npx expo start --web`. Match layout, spacing, type, colour, copy
  and interactions closely. The design is approved; do not redesign it.
- Port each screen into the placeholder page V0-1 created, splitting it into components under
  src/components/<area>/. Use only the cz kit; if something is missing, add it under your area
  folder and mention it in the handoff (don't edit the kit).
- Copy: every string goes to src/i18n/messages/{en,bn,ur}/<namespace>.json, using the existing
  en/bn/ur text from the Expo files. New strings in en only (V0-8 translates). Add the I18nText
  codes listed in docs/handoff/v0-2.md under the `server` namespace for en/bn/ur.
- Data: ONLY src/lib/data/hooks. Replace every demo.ts / *-data.ts / hex.ts / live.ts import with
  hooks. No inline demo numbers. Show SourceChips from meta wherever data appears.
- Every screen: loading skeleton, error + retry, empty state, guest-restricted (requireAccount()),
  dark mode, RTL (ur, ar), 360 px and 1280 px. Commit per screen. Handoff note at the end.
````

### V0-4: Onboarding, Home, Map (OpenStreetMap), Zone, Projection (🤖, about 4 h)

**Owns:** `app/[locale]/(app)/app/{page.tsx,onboarding,map,zone}`, `src/components/{onboarding,home,map,zone}` and the namespaces `onboarding, home, map, zone`.

````text
[PORTING RULES]
- S01–S03 onboarding (apps/mobile/src/screens/onboarding/*): language picker with all 10
  locales in their native names; location step (GPS or city search), radius slider 100–1000 m;
  a "Try the Dhaka demo" link that turns on Presentation mode; finishing sets onboarded.
- S04 Home (screens/home/{home,sections,score-card}.tsx): warnings banner first; air temperature,
  feels-like, heat-risk band, BMD-threshold pill (Bangladesh only, labelled "based on BMD
  thresholds"), "x° above normal", 5-day strip (useConditions); own-zone Heat Score gauge with
  causes + "+ green" what-if (useZones → useZone(my_zone_id)); hottest zones list; air card
  (useAir); trees needing a photo (useTrees; soft CTA for guests); active goal + next task
  (useGoals, usePlan). Farmer mode renders <FarmHome/> from V0-7 (leave a slot until merged).
- S05 Map (screens/map/heat-map.tsx, map-copy.ts): MapLibre GL with NEXT_PUBLIC_MAP_STYLE_URL
  (OpenFreeMap / OpenStreetMap), restyled toward the navy/lime palette in dark mode;
  "© OpenStreetMap contributors" attribution. Layers: H3 hexes from useZones via h3-js
  cellToBoundary as a GeoJSON fill coloured by the heat scale (opacity 0.55), scan circle, user
  dot, outlined hottest zone, near-tie badges. A scan animation (hexes fade in by score) for the
  presentation. Ranked list as a bottom sheet on mobile and a side panel on desktop. Rescan
  with the radius slider (debounced). Toggle "NASA land surface temperature (monthly)" using the
  GIBS tile URL from apps/mobile/src/lib/nasa.ts (optional; skip if short on time). Farmer
  mode: slot for <MyFields/> from V0-7. Tap a hex or row → /app/zone/[id].
- S06 Zone (screens/map/zone.tsx): drivers vs observed, causes, AI why_text (with an "AI
  explanation" chip), 20-year temperature history chart (port the SVG; label it "air
  temperature, hot season"), what-if, CTAs "Set a cooling goal" → /app/goal/new?zone=<id> and
  "See projection".
- S07 Projection (screens/map/projection.tsx): two lines (act / don't act) from useProjection,
  sliders for trees / roof m² / shade with debounced refetch, assumptions listed.
Done when the demo script steps 2–6 (§8) run smoothly on a phone and a laptop.
````

### V0-5: Plan and Act, with the camera and AI photo verification (🤖, about 4 h)

**Owns:** `app/[locale]/(app)/app/{plan,goal,species,nurseries,budget,log-action,contribution}`, `src/components/{plan,act,camera}` and the namespaces `plan, act`.

````text
[PORTING RULES]
- S08 Goal wizard (screens/plan/goal-wizard.tsx) → useGoals().create (guest → requireAccount()).
- S09 Feasibility (screens/plan/feasibility.tsx) → usePlan(goal).feasibility.
- S10 Plan tab (screens/plan/{plan,plan-store,planting-map,copy}.tsx): ranked actions with cost
  (local currency), water, effort, AI "estimate" chips; progress + next task; species shortlist;
  planting-spots map (MapLibre, usePlantingSpots, ground/roof/roadside styles); no-goal empty
  state → wizard. plan-store state becomes hook state.
- S11 Species (screens/plan/species.tsx) → useSpecies.
- S12 Nurseries (screens/act/nurseries.tsx): MapLibre markers + list, call link, directions link
  (Google Maps / geo: URL), distance in user units.
- S13 Budget (screens/act/budget.tsx) → usePlan(goal).budget.
- S14 Log action (screens/act/log-action.tsx): build src/components/camera/Camera.tsx
  (getUserMedia rear camera, capture to canvas, time + GPS overlay "sealed in", retake/confirm,
  file-input fallback, client-side resize). Then action type picker, quantity, optional team/goal,
  note → useLogAction → a "Verifying with AI…" state → result (verified ✓ with what the AI saw, or
  pending with the reason) → points animation.
- S15 Contribution (screens/act/contribution.tsx): photo, status, cooling contributed, points,
  share via the Web Share API (fallback: copy link).
The camera needs HTTPS on phones: test via the tunnel in DEV-CHECKLIST. Done when demo script
step 7–8 works on a real Android phone.
````

### V0-6: Community, Profile, Trees, Settings, Auth (🤖, about 4 h)

**Owns:** `app/[locale]/(app)/app/{community,team,org,profile,tree,notifications,settings,about}`, `app/[locale]/{auth,join}`, `src/components/{community,profile,auth}` and the namespaces `community, profile, auth`.

````text
[PORTING RULES]
- S16 Community hub (screens/community/hub.tsx): my teams, discover teams, leaderboards
  subject user/team × scope area/city/country × period, org cards.
- S17 Team (screens/community/team.tsx): stats, members (capacity 2–5), activity, shared goal,
  invite: link + QR + code + Web Share, leave.
- S18 Org (screens/community/org.tsx), S19 Create team (screens/community/create-team.tsx).
- /join/[code]: explains Atmos X; guest → register → joins (local teams join on this device;
  seeded team codes such as the Hall Rooftop Crew code also work).
- S20 Profile (screens/profile/profile.tsx): level, points (provisional shown separately), badges,
  my trees with 15-day due badges, recent actions, links.
- Tree /app/tree/[id] (screens/profile/{tree,trees-common}.ts): photo timeline, next due, "Add check"
  → V0-5's Camera (or a file input if it isn't merged yet) → useTreeCheck → AI health verdict + tip
  → points.
- S21 Notifications, S22 Settings (language ×10, °C/°F, area units, theme, farmer mode, Ask on/off,
  radius, Presentation mode + Reset demo, account: upgrade guest / log out, data sources).
- Auth (apps/mobile/src/app/auth.tsx): /auth/login, /auth/register (local accounts per §4.5),
  "Continue as guest", "Continue with Google" disabled with "coming soon". About
  (apps/mobile/src/app/about.tsx) + data sources and credits (OpenStreetMap ODbL, Open-Meteo
  CC BY 4.0, OpenAI, NASA GIBS if used, Unsplash credits from demo.ts, Lemon/Milk).
Done when demo script steps 9–10 work, and register → create team → invite QR → join from a second
browser profile works.
````

### V0-7: Air, Farmer mode, Ask Atmos panel (🤖, about 4 h)

**Owns:** `app/[locale]/(app)/app/{air,farm}`, `src/components/{air,farm,ask}` and the namespaces `air, farm, ask`.

````text
[PORTING RULES]
- S26 Air (screens/air/air-quality.tsx, i18n.ts) → useAir: PM2.5, AQI ring with EPA 2024
  colours, advice, 5-day forecast, my sensors. S27 Devices and S28 Add sensor
  (screens/air/{devices,add-sensor}.tsx) → useSensors (simulated device, clearly labelled).
- Farmer mode (screens/farm/{farm-home,fields,alert}.tsx): export <FarmHome/> for the Home slot
  and <MyFields/> for the Map slot; /app/farm/fields (add/edit field: crop, stage, pin on a
  MapLibre map; guests can preview alerts without saving); /app/farm/alert/[id] with hazard icon,
  level colour, what to do, time window, sources.
- Ask Atmos (apps/mobile/src/components/cz/ask-atmos.tsx): the full panel in the V0-1 slot, as a
  bottom sheet on mobile and a right drawer on desktop. It knows the ScreenId and route context,
  shows suggestion chips per kind (existing copy), attaches a photo (Camera or file input), streams
  via useAskStream, shows warnings first in their own style, the streamed text, source chips, action
  buttons that navigate only on tap, the "n of 30 today" counter (5 for guests) and 👍 feedback,
  and the footer "no medical or pesticide-dose advice". Hidden when prefs.askOn is false.
  Make it feel fast: show "Checking Atmos X data…" immediately and render tokens as they arrive.
Done when demo script steps 11–13 work in en and bn.
````

### V0-8: Translations for 10 languages (🤖+🧑, about 1.5 h, after V0-4 … V0-7 are merged)

**Owns:** `src/i18n/messages/**` and `scripts/translate.ts`.

````text
Read prompt-v0.md §1–§6. Write scripts/translate.ts (npx tsx; reads OPENAI_API_KEY from
.env.local): for hi, ar, es, fr, pt, id, zh (and any keys missing in bn/ur), translate only the
missing or changed keys from en with OPENAI_MODEL_CHEAP, in batches, JSON in → JSON out. The
glossary keeps "Atmos X", "Heat Score", "Ask Atmos", "NASA", "BMD", "PM2.5" and "AQI"
untranslated. Tone: short, plain, friendly, public-safety clarity. Validate that ICU
placeholders/plurals survive and retry on mismatch. Never overwrite human bn/ur strings. Mark
machine files with _meta.machine = true. Add `npm run i18n:check` (every locale has every key).
Run it, then sweep the app in ar and ur (RTL), hi and zh (fonts), and fix layout bugs inside your
own files or report the rest. A human speaker (🧑) spot-checks bn and ur on Home, Map, Zone,
Plan and Ask.
````

### V0-9: Landing page (🤖+🧑, about 2–3 h, starts when the design arrives)

**Owns:** `app/[locale]/(marketing)/**`, `src/components/landing/**` and the namespace `landing`.

````text
Read prompt-v0.md §1–§6. Design source: <PASTE THE LANDING DESIGN LINK / IMAGES HERE>. Treat it
as the source of truth; reuse cz tokens and fonts where they match. Sections (unless the design
says otherwise): hero with "Open the app" + "Install" (PWA prompt) and a phone mock showing the
real app; the problem (urban heat, Dhaka and worldwide); how it works (scan → understand → plan →
act → track); features (heat zones, plan, teams, trees, air, farmer mode, Ask Atmos, 10
languages); data and science (open data used today: OpenStreetMap, Open-Meteo, AI; "NASA
satellite data: coming in the next release": Landsat, HLS, MODIS, POWER, GEOS, IMERG, SMAP, kept
honest); the team and the NASA Space Apps 2026 credit; footer with attributions. All 10 locales
(run V0-8's script for the new keys). Static RSC, next/image, OG image (next/og), metadata,
hreflang, sitemap.ts, robots.ts. Lighthouse mobile ≥ 90 for performance, accessibility and SEO.
If the design hasn't arrived 4 h before the presentation, build a polished version of this
outline with the cz kit instead.
````

### V0-10: Presentation hardening (🤖, about 2 h, after V0-8)

````text
Read prompt-v0.md §1–§8. Make the demo bulletproof:
1. Walk the §8 demo script end to end in a production build (`npm run build && npm start`) on
   a 360 px viewport and at 1280 px; fix every broken link, layout jump, missing string and slow
   spinner. Prefetch the next screen's data where the script goes (e.g. zones when Home loads).
2. Run `npm run snapshot:dhaka` and verify every endpoint falls back to snapshots with the
   network off (simulate by pointing OVERPASS_URLS and the Open-Meteo base URL at a dead host via
   env). The app must still complete the demo script; the AI parts use canned fallbacks.
3. Performance: Lighthouse mobile on /app and /app/map ≥ 80 for performance; lazy-load
   MapLibre; code-split heavy screens; compress images; no layout shift on Home.
4. PWA: install on Android Chrome and iOS Safari via the HTTPS tunnel; check the icon, splash,
   standalone mode, offline shell, and the service worker updating cleanly after a redeploy
   (version the cache name).
5. Security pass: grep the .next output for the OpenAI key (it must not appear); make sure rate
   limits and the AI cap work; zod-validate all inputs.
6. Add the in-app "Presentation mode" checklist to docs/handoff/v0-10.md: how to reset, which
   phone, which language order, fallback plan.
````

### V0-T: Human test and rehearsal (🧑, about 2 h)

Testers use an **Android phone (installed PWA)**, an **iPhone (Safari)** and a **laptop (Chrome)**. Log issues in a shared sheet with the columns *ID · screen · device · steps · expected · actual · severity · owner prompt · status*.

**Install and shell**
- [ ] Installs on Android and iOS.
- [ ] Opens to `/app` in standalone mode. Back navigation works.
- [ ] With the network off, the shell, the cached Home and the demo still work.

**Language and theme**
- [ ] All 10 languages appear in the picker.
- [ ] বাংলা is complete, with Bangla digits.
- [ ] اردو and العربية are RTL with nothing clipped.
- [ ] Dark mode works everywhere.

**Home**
- [ ] Temperature and feels-like are within about 2 °C of a weather app.
- [ ] Above-normal and the 5-day forecast make sense.
- [ ] The BMD pill shows only in Bangladesh.
- [ ] Source chips are present.

**Map**
- [ ] The OSM map renders. A 500 m scan in Mohammadpur takes ≤ 12 s cold and is instant the second time.
- [ ] Hot hexes sit on dense roofs and roads, and cool ones on parks and water.
- [ ] Tapping a hex opens the zone.

**Zone and projection**
- [ ] The AI "why" text is in the chosen language and only mentions real drivers.
- [ ] The history chart shows.
- [ ] The sliders move the "act" line.

**Plan**
- [ ] Guest → set goal opens the account sheet.
- [ ] After registering: goal → feasibility → plan in ৳ → planting spots on the map → budget adds up.

**Log action**
- [ ] The in-app camera works on both phones.
- [ ] A photo of a plant is verified. A photo of a wall is pending, with a sensible reason.
- [ ] Points appear, and the leaderboard moves.

**Community**
- [ ] Create a team, get the invite QR, and join from a second browser.
- [ ] A 6th member is refused.

**Trees**
- [ ] The due tree shows on Home and Profile.
- [ ] A check photo gives an AI health verdict and points.
- [ ] The next due date is 15 days later.

**Air and farm**
- [ ] AQI colours match the EPA bands.
- [ ] Farmer mode with Boro at flowering shows alerts with actions.

**Ask Atmos**
- [ ] It's on every screen and knows the screen.
- [ ] A Bangla question gets a Bangla answer with sources.
- [ ] It refuses pesticide doses.
- [ ] The guest limit (5) works.
- [ ] A photo question gets an answer.

**Desktop**
- [ ] The sidebar works, and the map is two-pane.
- [ ] There's no horizontal scroll, and keyboard focus is visible.

**Rehearsal:** run the §8 script twice, in under 4 minutes each time, once with the phone in airplane mode after warming the cache.

---

## 10. Smoke path for the Integrator after every merge

Run `npm run build` once, then `npm run dev`, then check:
1. `/` loads.
2. `/app` with Presentation mode loads Home with numbers.
3. `/app/map` shows hexes.
4. A zone opens.
5. Ask answers one question.
6. Switching to `bn` and back works.

Run `npm run lint && npm run typecheck` before pushing.

---

## 11. What v1 replaces (bridge to prompt-v1.md)

| v0 piece | v1 replacement |
| --- | --- |
| `src/server/heat` OSM heat proxy | NASA Landsat/HLS/MODIS pipeline in FastAPI (v1 C1). The proxy stays as a fallback provider. |
| Open-Meteo archive normals and history | NASA POWER + MODIS (v1 C2) |
| Open-Meteo Air Quality | NASA GEOS-CF + OpenAQ (v1 C3) |
| `farmer.ts` port | IMERG, SMAP, LIS/OTD-backed rules (v1 C4) |
| AI plan details | Curated species and cost tables + engine (v1 C5). AI stays for wording. |
| `/api/v0/ask` | FastAPI `/api/v1/ask` (v1 C6), with the same SSE events |
| IndexedDB user data + local accounts | Postgres + real auth (v1 B1–B3). Add a one-time "import my device data" step on first login. |
| Seed community | Real users and teams |
| `src/lib/data/hooks` internals | The generated FastAPI client. **Screens stay unchanged.** |
