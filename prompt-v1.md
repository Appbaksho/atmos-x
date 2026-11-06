# Atmos X: V1 master implementation prompt

> **How to run it:** open a fresh Claude Code session at the repo root and say: *"Read `prompt-v1.md` completely, then execute it from Stage 0 to Stage 9."*
> **Finalized 4 Nov 2026** from the repository audit in `ATMOSX_V1_AUDIT.md`. This file is self-contained: it carries every requirement from the audit (`docs/Atmos X App Audit and Build Plan.md`), the earlier V1 plan (in git history at `725d303:prompt-v1.md`) and the NASA research, so you can finish the job even if those documents are not open.
> Facts marked **Verified** were tested against the live service on 4 Nov 2026. Facts marked **Check** could not be tested and must be confirmed before you rely on them.

---

## 0. Your job and how to work

Transform the working V0 (Next.js web app + PWA, device-only data, OpenStreetMap heat estimate, OpenAI text and photo checks) into V1: the same app and design, on a real backend, with **NASA satellite and climate data as the foundation**, real accounts, real community, trees and points, and a points store with a company marketplace.

**Work autonomously from Stage 0 to Stage 9.**

- Make reasonable decisions yourself and record them in `docs/v1/decisions.md`. Do not stop to ask for approval.
- Do not stop after planning, scaffolding or writing documents. The deliverable is working software.
- Inspect existing code before you change it. Port and reuse; do not replace working code without a reason.
- Fix what you find. Run the verification commands; never assume something works.
- Never claim that an integration or test works unless you ran it and saw it work. Report anything you could not verify, with the reason.
- No placeholders, `TODO` implementations or fake data where a real implementation is required.
- If a credential is missing, build and unit-test the feature, let it degrade honestly at runtime (§10), list it in the final report, and continue. A missing third-party key is never a reason to stop or to fake data.

**Hard limits. Do not do any of these without explicit human approval:**

- Deploy to production, touch the VPS, or push to any remote. Commit locally on branch `v1` only; this prompt authorizes those local commits.
- Delete user data, drop databases other than your own local dev database, rewrite git history or force-push.
- Print or copy the values in `.env`, `.env.local` or any other secret store. Refer to them by name only.
- Take real money: `SSLCOMMERZ_SANDBOX` stays `true`.
- Sell or label anything as a carbon credit or offset (§6.10).

**Rules from this repo that still apply:**

- `apps/web` is Next.js 16 and differs from your training data. Read `apps/web/node_modules/next/dist/docs/` before using a Next API. Middleware is `src/proxy.ts`.
- Screens get data only through `apps/web/src/lib/data/hooks`. No demo numbers inside screens.
- No hard-coded user-facing strings: use `src/i18n/messages/{locale}/{namespace}.json`.
- Every screen has loading, error, empty and guest-restricted states, plus dark mode, RTL (`ur`, `ar`), and 360 px and 1280 px layouts.
- You are the only agent in this tree, so the old "don't run `npm install` or `next build`" rule for parallel agents does not apply to you. Update `AGENTS.md` accordingly.

---

## 1. What Atmos X is

Atmos X helps people **cool their own neighbourhood** using NASA satellite, weather and climate data. It was built for NASA Space Apps 2026, has Dhaka as its home story and works worldwide. It ships only as a web app + installable PWA. There is no native app; the old Expo prototype is at `git show 9841c47:apps/mobile/<path>`.

What it must do:

1. **Installable PWA** that also works as a normal desktop website.
2. **Scan around you** and rank the hottest spots as H3 hexagon zones.
3. Each zone has a **Heat Score (0–100)** and a breakdown of **why** it is hot: sealed surfaces, lack of greenness, dense buildings and population, dark roofs.
4. **How hot is it now?** Air temperature, feels-like, whether it is above normal for the date, a 5-day forecast. In Bangladesh, BMD heat-wave levels; elsewhere NOAA heat-index bands.
5. **Set a cooling goal** and get an action plan: trees, cool roofs, shade, water and care, with costs.
6. **Find planting spots and roofs**, and see future cooling as two lines: "if you act" and "if you don't".
7. **Work solo, in a team of 2–5, or under an organization**, with photo verification, points, badges and leaderboards.
8. **Tree care tracking:** a photo update every 15 days. Nearby nurseries on a map.
9. **Air quality:** PM2.5 and AQI, plus your own sensor.
10. **Farmer mode:** crop alerts for flood, heat, drought, cold wave and lightning, by crop and growth stage.
11. **Ask Atmos** on every screen: knows the screen, answers from Atmos X data with source chips, shows warnings first. In V1 it is deterministic (§6.12).
12. **10 languages:** `en`, `bn`, `ur` (RTL), `hi`, `ar` (RTL), `es`, `fr`, `pt`, `id`, `zh`.
13. **New in V1:** My trees, feed and follows, events, a points store with partner products, tree purchases, and a company marketplace.

**Demo story:** Nadia Rahman in Mohammadpur, Dhaka cools the Asad Gate block with the Hall Rooftop Crew team. It is demo data and is always labelled as such.

---

## 2. Where the repo is today (audit baseline)

Re-check these in Stage 1; do not assume this section stays true.

**Stack that exists:** `apps/web` only. Next.js 16.3.8, React 19, next-intl, TanStack Query, MapLibre, h3-js, Tailwind 4, vitest, about 29,000 lines of TypeScript. `apps/api` is an empty README. No database, no Docker Compose, no Makefile, no Playwright. The live app is at `atmosx.baksho.app` behind nginx on a VPS. Baseline in a clean copy: 116 tests pass, typecheck, lint, `i18n:check` and `next build` all pass. `node_modules` is not installed in the working tree.

**What actually works (real data flow):**

- Conditions, forecast, normals and 20-year history: Open-Meteo and its ERA5 archive (`src/server/weather/*`). Not NASA.
- Air: Open-Meteo CAMS model plus an EPA AQI computed by us (`src/server/air/*`).
- Heat zones: a deterministic **estimate** from OpenStreetMap land cover and air temperature (`src/server/heat/*`). Not satellite data, and not AI.
- Planting spots and nurseries: Overpass. Reverse geocoding: Nominatim.
- Farmer alerts: 9 deterministic rules (`src/server/farm/alerts.ts`) over the Open-Meteo forecast. Good code; port it.
- Camera, PWA, RTL, 10 languages, UI kit, Presentation mode, "Continue with Google" popup exchange.

**NASA use today is almost nothing:** NASA POWER 30-day rainfall feeds one drought rule, and an optional GIBS monthly MODIS raster sits on the map.

**OpenAI use today (all of it goes away, §3.2):** `why_text`, plan details including unit costs, species outside Bangladesh, photo verification, tree health checks, Ask Atmos, and `scripts/translate.ts`. The heat score itself never used AI.

**Not real, though it looks real:**

- Accounts, goals, actions, trees, teams, fields and photos are in IndexedDB on one device (`src/lib/data/local/*`). Passwords are hashed locally.
- Community, leaderboards, Discover and org pages are a static seed (`src/lib/data/seed/community.json`) that names real organizations.
- Team totals come from a seeded base number, so they do not add up.
- Sensors are simulated (area PM2.5 ±8 %).
- Three "curated" Dhaka nurseries have invented coordinates (`src/server/places/nurseries.ts`: "the prototype only had distances"). Remove them.
- `dark_roof_pct` is a constant per country, and `night_lst_c` and `pop_density_km2` are guesses. `ndvi` is always null.
- A `synthetic.ts` heat field and committed Dhaka snapshots serve as fallbacks. Remove both (§4).
- The landing page is still `LandingPlaceholder`; `landing.json` is empty.
- Ask's feedback button and the alert's "I've done it" store nothing.

**Root cause of the worst bugs, reproduced on the live API:** `GET /api/v0/zones` returned "Road 5 · 93 · 478 m" while `GET /api/v0/zones/{that id}` returned "Road 6 · 87". Three design faults combine:

1. When Overpass fails, the list silently comes from the frozen Dhaka snapshot dated 4 Oct 2026, after waiting out a 25 s deadline. That is also why scans take 25 s.
2. `scanForZone` (`src/server/heat/scan.ts`) re-derives the zone from whichever scan a global, last-writer-wins `zoneidx` cache entry points to, then falls back to "a zone containing this cell", then to "the nearest zone".
3. Zone IDs (`z-<h3>-<radius>`) are not references to anything stored, and a cell's score depends on the median of whichever scan it is in.

V1 must make this class of bug impossible (§7.3), not patch it.

**Security finding:** a real-looking Google OAuth client secret is committed in `apps/web/.env.example` (commit `725d303`) and is on `origin/main` and `origin/v0`. Scrub the file in Stage 0. Rotating the secret is a human task (§14).

---

## 3. Locked decisions

### 3.1 Architecture

| Area | Decision | Why |
| --- | --- | --- |
| Client | Keep `apps/web` (Next.js 16, same design system, same screens, same hook names) | It works. V0 was built so hooks could swap to a real API without touching screens |
| Backend | **FastAPI + worker in `apps/api`**, Python 3.12+, uv | Already the documented plan. Concrete reason: rasters (COG, HDF5, NetCDF) need `rasterio` and `h5py`, and long jobs do not belong in Next route handlers |
| Database | **Postgres 16 + PostGIS** (Docker Compose locally) | A scan must be a database read; real accounts, points and orders need transactions |
| Browser access | Same origin: Next rewrites `/api/v1/*` and `/media/*` to FastAPI | First-party cookies, no CORS. All keys stay in `apps/api`; **the Next server holds no secrets** |
| Queue | A `jobs` table with `FOR UPDATE SKIP LOCKED`, plus APScheduler in the worker | No Redis, Celery or extra services |
| Files | Local disk behind a small `Storage` interface | S3 can come later |
| Client data | `openapi-typescript` + `openapi-fetch` generated from FastAPI's OpenAPI document | One contract |

Do not add microservices, Redis, Kafka, GraphQL or a new frontend framework.

### 3.2 No OpenAI. No LLM at runtime

V1 has **no OpenAI SDK, key, model variable or API call**, and no other LLM. Every feature below keeps working, from NASA data and deterministic logic.

| V0 use of OpenAI | File | V1 replacement |
| --- | --- | --- |
| "Why is this zone hot?" text | `server/ai/explain.ts` | Deterministic sentences from measured drivers, as I18nText in 10 languages (§7.4). It restates numbers and cannot invent any |
| Plan: species pick, unit costs, water, steps, care plan, next task | `server/plan/plan.ts` | Cost tables, curated species ranking, and message templates (§7.10). V0's deterministic `fallbackSteps` already show the shape |
| Species shortlist outside Bangladesh | `server/plan/species.ts` | Curated tables by climate band from NASA POWER normals, labelled as commonly planted, no invented prices (§7.10) |
| Photo verification | `server/ai/verify.ts` | Deterministic checks plus human review (§7.11) |
| Tree health check | `server/ai/tree-check.ts` | The person reports health, deterministic checks run, and tips come from species, season and recent NASA rainfall (§6.7) |
| Ask Atmos | `server/ai/ask.ts` | Intent routing to the same data, templated answers, same SSE events (§6.12) |
| Translation script | `scripts/translate.ts` | Translate new strings yourself in this session and mark machine files with `_meta.machine`. Keep `i18n:check` |

Remove the `openai` dependency, all `OPENAI_*` and `AI_DAILY_REQUEST_CAP` variables, every "AI" chip and string, and `SRC.ai`. The audit's phrases "AI text", "AI location check" and "smaller model for photo checks" assumed OpenAI stays; those requirements are met deterministically here.

### 3.3 No Google Earth Engine

The older plan made Earth Engine the primary route to Landsat. Do not use it. **Verified:** Google's terms do not allow unpaid commercial use, noncommercial quota is capped (Community Tier: 150 EECU-hours), and this product sells trees and company packages. The route in §5 reaches the same NASA and USGS data with no account and no such restriction. Do not add `earthengine-api` or any `GEE_*` variable.

### 3.4 Other decisions

- **H3 resolution 10 everywhere.** Landsat's thermal band is natively 100 m; a res-10 hex (about 15,000 m²) holds about 1.5 native pixels and 16–21 of the 30 m resampled pixels. Res 11 (2,150 m²) would be false precision, so the old "res 11 under 300 m" rule is dropped.
- **Sign-in:** phone OTP, Google, and email + password (already built). Guest mode stays.
- **Teams are 2–5 members.** Roles are `lead` and `member`.
- **No fixture fallback at runtime.** `DATA_MODE=fixture` exists only for tests and offline development.
- **Prices and points are configuration**, stored in tables, because the audit calls them proposed values.

---

## 4. Data integrity rules (non-negotiable)

1. Real retrieval only. Never present fabricated or simulated data as an observation. Delete `src/server/heat/synthetic.ts`, `src/server/snapshots/**` and `scripts/snapshot.ts`.
2. Every value carries its **kind**, and the UI shows it:
   `observation` (a satellite or sensor measured it), `model` (a reanalysis or model nowcast), `forecast`, `derived` (our deterministic maths on real inputs), `estimate` (our coefficients or assumptions), `reference` (curated tables), `demo` (demo story).
3. Surface temperature is not air temperature. Label them separately everywhere.
4. Convert units explicitly and test each conversion (§5.2). Treat fill values as missing, never as numbers.
5. Store timestamps in UTC and show acquisition dates. A satellite value always shows its date range, and old data is labelled as old.
6. Coordinates: GeoJSON is `[lng, lat]`; H3 and our API are `lat, lng`. Convert between CRSs with a real transform (§5.2).
7. A missing value stays `null` and renders as "no data", with a reason where useful. Never fill a gap with a guess unless it is labelled `estimate`.
8. A failed source never produces invented output. Use the fallback chain in §5.3, labelled; then last-good data labelled stale; then an honest error.
9. Attribute every source in `meta.sources`, on `/sources` and on the About page.
10. Only `source: 'BMD'` may be called official, and only for a real bulletin. **Check result:** BMD publishes daily PDFs (`bamis.gov.bd/res/public/weather_table/pdf/YYYY-MM-DD.pdf`) and no machine-readable feed was found. So warnings stay `source: 'local'`, labelled "computed from BMD thresholds, not an official warning". Do not scrape PDFs into "official" warnings.
11. Numbers in pitches, the landing page and About (such as "15 NASA datasets") must come from what `/sources` reports as active. Never hard-code a count.

---

## 5. NASA and data sources

### 5.1 Summary

Only GIBS and basemap tiles are fetched by the browser; everything else goes through `apps/api`.

| Source | What for | Auth | Status 4 Nov 2026 |
| --- | --- | --- | --- |
| Landsat 8/9 Collection 2 L2 (`landsat-c2-l2`, Microsoft Planetary Computer) | 30 m LST, reflectance, NDVI fallback, albedo | None | **Verified** end to end |
| HLS v2.0 (`hls2-l30`, `hls2-s30`, same host) | NDVI | None | **Verified** end to end; latest 2 Nov |
| MODIS MOD11A1, MYD11A1, MOD11A2, MYD11A2 (`modis-11A1-061`, `modis-11A2-061`, same host) | Night LST, 1 km fallback, 20+ year history | None | **Verified** end to end, including 2004 data; latest 2 Nov and 16 Oct |
| ESA WorldCover v200 (`esa-worldcover`, same host). Not NASA | 10 m land cover | None | **Verified** end to end |
| ECOSTRESS `ECO_L2T_LSTE.002` (LP DAAC) | 70 m LST sharpening, night heat | Earthdata | **Verified** in CMR-STAC. **Check** pixel read |
| NASA POWER daily API | Normals, recent observed weather, rain deficit | None | **Verified** |
| GEOS-FP (NCCS OPeNDAP) | 10-day forecast at 0.25° × 0.3125° | None | **Verified**, slow |
| GEOS-CF **v2** (NCCS OPeNDAP) | PM2.5 forecast at 0.25° | None | **Verified**. v1 is frozen |
| GPM IMERG V07 Early (GES DISC) | Rain, last 72 h | Earthdata | **Verified** in CMR. **Check** read |
| SMAP L4 `SPL4SMGP` **v008** (NSIDC) | Soil wetness, drought | Earthdata | **Verified** in CMR. **Check** read |
| LIS/OTD HRMC `lohrmc` v2.3.2015 (GHRC) | Lightning climatology | Earthdata | **Verified** in CMR. **Check** read |
| NEX-GDDP-CMIP6 (NCCS THREDDS NCSS) | Future warming | None | **Verified** |
| ORNL DAAC MODIS web service | Fallback LST and history | None | **Verified**; about 6 weeks behind |
| NASA GIBS WMTS | Context LST imagery | None | **Verified** |
| SEDAC GPWv4.11 | Population density | Earthdata | Listed in CMR; SEDAC site timed out. **Check** |
| Open-Meteo forecast, air, geocoding. Not NASA | "Now" readings, cross-check, fallback | None / key | **Verified**. Free tier is non-commercial |
| OpenAQ v3. Not NASA | Measured PM2.5 | Key | **Check** |
| Nominatim, Overpass (OpenStreetMap) | Names, buildings, roads, nurseries | User-Agent | Nominatim **Verified**. All Overpass mirrors failed on 4 Nov: worker-only |
| DB-IP City Lite | IP to city fallback, local file | None | **Verified** download. Attribution required |

**There is no `api.nasa.gov` key in this design.** The only NASA credential is Earthdata Login.

### 5.2 Source details

Put each in `apps/api/app/providers/`. Parse only what you need. Validate with Pydantic. Run a real request in `make verify-sources` (Stage 4).

Rate limits: limits are stated below where a source publishes them and they could be confirmed. Others (POWER, NCCS, Planetary Computer, GES DISC, LP DAAC) are unconfirmed, so run one job at a time per host, cache as in §8.8, and honour `429` and `Retry-After`.

**Landsat C2 L2 surface temperature.** Landsat is a joint NASA and USGS mission. Credit: "Landsat-8/9 image courtesy of the U.S. Geological Survey".

- Search: `POST https://planetarycomputer.microsoft.com/api/stac/v1/search` with `{"collections":["landsat-c2-l2"],"bbox":[w,s,e,n],"datetime":"<from>/<to>","limit":40,"query":{"platform":{"in":["landsat-8","landsat-9"]},"eo:cloud_cover":{"lt":60}},"sortby":[{"field":"datetime","direction":"desc"}]}`. Dhaka is WRS path 137, rows 043 and 044, with a pass about every 8 days. 2026 had 78 items, 39 under 40 % cloud.
- Read access, for every Planetary Computer dataset: parse the storage account and container from the asset href (`https://<account>.blob.core.windows.net/<container>/...`), then `GET https://planetarycomputer.microsoft.com/api/sas/v1/token/<account>/<container>`. It returns `{"token", "msft:expiry"}`; append `?<token>` to the href. Cache until expiry and never log it. **Verified** on Landsat, HLS, WorldCover and MODIS. The collection-name route (`/token/<collection>`) returned 403 on MODIS assets, so do not use it. Do not use the USGS LandsatLook asset URLs: they redirect to a login.
- Assets: thermal is **`lwir11`, not `ST_B10`**. Also `qa_pixel`, and `blue`, `green`, `red`, `nir08`, `swir16`, `swir22`.
- LST: `T_K = DN × 0.00341802 + 149.0`; DN 0 is nodata; `°C = T_K − 273.15`. COG in UTM; GSD 100 m, resampled to 30 m.
- Mask with `qa_pixel` bits: 0 fill, 1 dilated cloud, 2 cirrus, 3 cloud, 4 cloud shadow, 5 snow. Water pixels are valid.
- Reflectance: `ρ = DN × 0.0000275 − 0.2`.
- Overpass is about 10:20 local, so this is morning-to-midday surface temperature. Say so on the About page.
- **Measured:** one 1 km scan, 6 scenes read sequentially, 25 s cold. All of Dhaka city (786 × 592 pixels, about 24,800 hexes, 4 scenes, 4 concurrent reads) in about 26 s. Run it in the worker, never in a request.

**ECOSTRESS `ECO_L2T_LSTE.002`.**

- Search: `POST https://cmr.earthdata.nasa.gov/stac/LPCLOUD/search`, collection `ECO_L2T_LSTE_002` (no auth to search). Dhaka tiles are `45QZG` and `46QBM`; 35 granules in about 2 months.
- Assets are COGs at `data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/...` (`_LST`, `_LST_err`, `_QC`, `_cloud`, `_water`), read with a bearer token. Give GDAL the token through `rasterio.Env` headers.
- The `cloud` layer, not `QC`, decides clear or cloudy in v002.
- **Check** on first read: LST is in Kelvin; confirm dtype, scale and valid range against the LP DAAC user guide before converting.
- Passes happen at any time of day (30 Oct 15:58 UTC was 21:58 local; 22 Oct 19:05 UTC was 01:05 local). Compute local solar time from the timestamp and longitude, and keep day and night passes apart (§7.1).

**HLS NDVI.**

- `hls2-l30` uses `B04` red and `B05` NIR. `hls2-s30` uses `B04` red and `B8A` NIR. MGRS tiles over Dhaka are `T45QZG` and `T46QBM`, which overlap, so filter by cloud and date. Same token flow.
- **Verified** from the files: int16, nodata −9999, scale 0.0001, 30 m, UTM. `Fmask` is uint8, nodata 255. A cloud-free scene over Mohammadpur (25 Oct) gave NDVI median 0.24, P95 0.61.
- `Fmask` bits 1 cloud, 2 adjacent, 3 shadow, 4 snow, 5 water. The bit layout is from memory of the LP DAAC guide and was only partly confirmed (no cloud bits on a 0 % scene; about 5 % water bit). **Check** the guide.
- NDVI = (NIR − Red) / (NIR + Red). Fallback: Landsat `red` and `nir08`.

**MODIS LST.** Same host. Assets `LST_Day_1km`, `LST_Night_1km`, `QC_Day`, `QC_Night` as COGs, in Sinusoidal projection (tile `h26v06` over Dhaka). **Verified:** uint16, nodata 0, scale 0.02, 927 m pixels; `T_K = DN × 0.02`. This avoids HDF4 entirely. Each pixel covers many hexes, so label `resolution_m: 1000`. Results contain both Terra (`MOD`) and Aqua (`MYD`) items. **Cloud matters:** 8 of the 10 most recent daily values at Dhaka were fill, so use the 8-day composites (`modis-11A2-061`) for night heat and history, about 2 items per 8 days. A May 2004 composite read fine (41.4 °C).

**ESA WorldCover v200 (2021).** `esa-worldcover`, asset `map`, 10 m, EPSG:4326; filter on `esa_worldcover:product_version = 2.0.0`. Dhaka tile `ESA_WorldCover_10m_2021_v200_N21E090`. Classes: 10 tree, 20 shrub, 30 grass, 40 crop, 50 built, 60 bare, 70 snow, 80 water, 90 wetland, 95 mangrove, 100 moss. Credit under CC BY 4.0. Show the year: it is a 2021 snapshot.

**NASA POWER.** `GET https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M&community=AG&longitude=&latitude=&start=YYYYMMDD&end=YYYYMMDD&format=JSON`. Values at `properties.parameter.<NAME>.<YYYYMMDD>`; units in `parameters.<NAME>.units` (°C, mm/day, %). Fill is **−999**.

- Recent days lag about 2–3 days; filter fills. Solar parameters lag more and change units by `community`.
- **Do not use the climatology API for a normal.** **Verified:** climatology `T2M_MAX` is the maximum hourly value in the whole period (April 42.5 °C at Dhaka), and `T2M_MAX_AVG` is the average of each year's monthly extreme (April 39.3 °C). The true mean daily maximum in April is 36.1 °C. The old plan's formula would have shown Dhaka 3–6 °C "below normal" all year.
- **Normal:** fetch daily `T2M_MAX` for 2001-01-01 to 2025-12-31 (about 2 s, 309 KB), and take the mean for day-of-year ±7. This gives 28.8 °C for 4 Nov and 36.2 °C for 15 Apr at Dhaka. Cache for 30 days per 0.5° cell.

**GEOS-FP forecast.** `https://opendap.nccs.nasa.gov/dods/GEOS-5/fp/0.25_deg/fcast/tavg1_2d_slv_Nx/tavg1_2d_slv_Nx.YYYYMMDD_HH` (GrADS DODS, no auth). Cycles 00, 06, 12, 18. The newest listed run may not be available yet, so walk back. 00Z has 240 hourly steps.

- Query: `<url>.ascii?t2m[0:1:119][LAT][LON]`, with `LAT = round((lat+90)/0.25)` and `LON = round((lng+180)/0.3125)`. Dhaka is `[455][865]`.
- In curl use `-g`, or encode the brackets.
- `t2m` is Kelvin, fill `1.0E15`, time starts at `:30` past the hour in UTC. Also available: `t2mdew`, `u10m`, `v10m`. Derive RH from T2M and dew point (Magnus).
- **Verified, and slow:** 72 steps took 27–53 s, and 120 steps once returned 504. So **worker only**, 120 s timeout, one call per 0.25° cell per run, results cached.
- Aggregate hours to local days using the location's UTC offset.
- On 4 Nov at Dhaka, GEOS-FP Tmax/Tmin was 32.0/20.3 °C and Open-Meteo 30.5/24.4 °C. It is a coarse grid, so apply the sanity rule in §7.7.
- NCCS shows a notice of "important changes coming to GEOS-FP". Parse the directory listing rather than assuming paths never change, and report failures in `/health`.

**GEOS-CF v2 PM2.5.** **v1 is dead:** its OPeNDAP listing stops at 9 Dec 2024. Use `https://opendap.nccs.nasa.gov/dods/gmao/geos-cf/v2/fcst/aqc_tavg_1hr_glo_L1440x721_slv/aqc_tavg_1hr_glo_L1440x721_slv.YYYYMMDD_09z`.

- Query: `<url>.ascii?pm25_rh35[T0:1:T1][0:0][LAT][LON]` with `LAT = round((lat+90)/0.25)` and `LON = round((lng+180)/0.25)`. Dhaka is `[455][1081]`.
- Units µg/m³ at 35 % RH; fill `1.0E15`; 120 hourly steps. Verified: 5 steps in 15 s; a value of 41.7 µg/m³ read from the matching file. Worker only.
- Fallback, if OPeNDAP fails: hourly files at `portal.nccs.nasa.gov/datashare/gmao/geos-cf/v2/fcst/Y%Y/M%m/D%d/` (about 6.7 MB each, `Accept-Ranges: bytes`, variable `PM25_RH35`).
- `PM10_RH35` returned exactly the same number as PM2.5 at Dhaka. Do not use it until you understand why.
- Open-Meteo PM2.5 was 52.3 at the same time, so show both.

**GPM IMERG V07 Early.** Daily `GPM_3IMERGDE` v07 (latest 3 Nov) and 30-minute `GPM_3IMERGHHE` v07 (latest 4 Nov 09:30 UTC).

- Files on `data.gesdisc.earthdata.nasa.gov`, for example `/data/GPM_L3/GPM_3IMERGDE.07/2026/11/3B-DAY-E.MS.MRG.3IMERG.20261103-S000000-E235959.V07C.nc4`. OPeNDAP at `gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/...`.
- Earthdata Login with the "NASA GESDISC DATA ARCHIVE" application approved. Find granules through CMR (concept `C2723754850-GES_DISC` for daily).
- **Check** on first read: variable `precipitation`, 0.1° grid, dimension order, units (mm/day for daily, mm/hr for half-hourly), fill.
- Label it near-real-time and satellite-estimated. Cache per 0.1° cell per day.

**SMAP L4 `SPL4SMGP` v008.** v007 is deprecated. 3-hourly, 9 km, about 2 days behind. Concept `C3480440870-NSIDC_CPRD`. Files on `data.nsidc.earthdatacloud.nasa.gov`; `opendap.earthdata.nasa.gov/collections/<concept>/granules/...` also exists. Variables include `sm_surface_wetness` and `sm_rootzone_wetness` (0–1, need no climatology). **Check:** HDF5 group `Geophysical_Data`, EASE-2 grid lookup. Granules are large, so prefer OPeNDAP or range reads.

**LIS/OTD HRMC.** One file: `https://data.ghrc.earthdata.nasa.gov/ghrcw-protected/lohrmc__2.3.2015/LISOTD_HRMC_V2.3.2015.nc`. Download once to `${DATA_DIR}/static/` in a setup script (`make static-data`). Sample locally. **Check** variable names.

**NEX-GDDP-CMIP6.** `https://ds.nccs.nasa.gov/thredds/ncss/grid/AMES/NEX/GDDP-CMIP6/<MODEL>/<ssp>/r1i1p1f1/tasmax/tasmax_day_<MODEL>_<ssp>_r1i1p1f1_gn_<YEAR>_v2.0.nc?var=tasmax&latitude=&longitude=&time_start=&time_end=&accept=csv`. Verified: 3 days of 2040 for ACCESS-CM2 ssp245 in 12 s, Kelvin, at grid point 23.875, 90.375. **Check** which models and version suffixes exist before fixing the model list, and use `historical` for the baseline. Worker only; cache forever per 0.25° cell.

**ORNL MODIS web service.** `https://modis.ornl.gov/rst/api/v1/MOD11A2/{dates,subset}`, `Accept: application/json`. Band `LST_Day_1km`, scale 0.02, Kelvin, 0 = fill. **Maximum 10 composites per request.** Latest composite was 22 Sep on 4 Nov, about 6 weeks behind. Fallback only. Port `fetchLstGrid` from `git show 9841c47:apps/mobile/src/lib/nasa.ts`.

**NASA GIBS.** Browser tiles, no key. `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Land_Surface_Temp_Day/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`. Path order is z, then y, then x. Max zoom 7 (about 1 km). Cloud and swath gaps can return 404, so handle them silently. Read the default date from `WMTSCapabilities.xml` (5.8 MB; fetch it in the API and cache it).

**GPWv4.11.** `CIESIN_SEDAC_GPWv4_POPDENS_R11` in CMR; a 30-arc-second grid for 2020. The SEDAC site timed out from here. If you can get the GeoTIFF into `${DATA_DIR}/static/` through `make static-data`, sample it. Otherwise `pop_density_km2` stays `null`, the Heat Score re-normalizes (§7.2), and you report it.

**Open-Meteo.** Port from `src/server/weather/forecast.ts` and `src/server/air/air.ts`. If `OPEN_METEO_API_KEY` is set, use the customer host (**Check** on the pricing page; believed to be `customer-api.open-meteo.com`) and add `apikey=`. Free tier: under 10,000 calls a day, 5,000 an hour, 600 a minute, non-commercial, credit under CC BY 4.0.

**OpenAQ v3.** `GET https://api.openaq.org/v3/locations?coordinates=&radius=25000&limit=`, then `GET /v3/locations/{id}/latest`, header `X-API-Key`. **Check:** docs show both `lat,lng` and `lng,lat` for `coordinates`. Test with a real key, assert the returned locations are near Dhaka, lock the order in a recorded fixture.

**Nominatim.** `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=&lon=&zoom=16&addressdetails=1&accept-language=`. At most 1 request per second, real contact in `User-Agent`, cache for 30 days.

**Overpass.** Port the queries and the hedging from `src/server/http.ts` and `heat/landcover.ts`. **Worker only.** Failures never block a scan.

**DB-IP City Lite.** `https://download.db-ip.com/free/dbip-city-lite-YYYY-MM.mmdb.gz`. Read locally with `maxminddb`, so no user IP goes to a third party. Credit "IP Geolocation by DB-IP" on About.

### 5.3 Feature to source: fallback chains

Each arrow means "if the previous is unavailable, use this and label it". The chain ends with last-good data labelled stale, then an honest error.

| Feature | Chain | Kind shown |
| --- | --- | --- |
| Hex day LST | Landsat 120-day median → Landsat 365-day → MODIS 1 km → land-cover estimate (§7.1) | observation → estimate |
| LST sharpening | ECOSTRESS day passes → none | observation |
| Night heat | ECOSTRESS night passes → MODIS `LST_Night_1km` → `null` | observation |
| NDVI | HLS → Landsat SR → `null` | observation |
| Sealed, green, water shares | WorldCover → OSM fractions → `null` | observation |
| Dark surface share | Landsat albedo over built pixels → `null` | derived |
| Population | GPWv4 → `null` | reference |
| Normal, anomaly | POWER daily 2001–2025 → `null` | derived |
| Now, feels-like | Open-Meteo current → GEOS-FP nearest hour | model |
| 5-day forecast | GEOS-FP with sanity rule → Open-Meteo | forecast |
| PM2.5 now | Fresh sensor or OpenAQ station within 2 km → Open-Meteo CAMS → GEOS-CF v2 | observation → model |
| PM2.5 forecast | GEOS-CF v2 → Open-Meteo CAMS | forecast |
| Rain, last 72 h | IMERG Early → POWER → `null` | observation → model |
| Rain forecast | Open-Meteo | forecast |
| Drought | SMAP wetness + POWER rain deficit → POWER + Open-Meteo ET0 | observation → derived |
| Lightning | Open-Meteo thunderstorm codes and CAPE, weighted by LIS/OTD if present | forecast + reference |
| 20-year history | MOD11A2 on Planetary Computer → ORNL | observation |
| Future warming | NEX-GDDP-CMIP6 ensemble delta → observed MODIS trend → flat line with a note | model → derived |
| Place names | Stored scan label → Nominatim → OSM → "Zone N" | reference |
| Nurseries | Overpass (worker, cached 7 days) → cached | reference |

### 5.4 Errors in earlier plans. Do not reintroduce them

| Earlier plan said | Reality |
| --- | --- |
| Normal = POWER climatology `T2M_MAX` | That is an extreme, not a mean (§5.2) |
| Landsat `ST_B10` on Planetary Computer | The asset key is `lwir11` |
| GEE `CIESIN/GPWv4_11/...` | Wrong ID, and GEE is dropped anyway |
| `SPL4SMGP` v007 | Deprecated; use v008 |
| GEOS-CF `chm_tavg_1hr_g1440x721_v1`, `PM25_RH35_GCC` | v1 stopped. Use v2, `pm25_rh35` |
| Projection = MODIS trend **plus** CMIP6 delta | Double-counts warming. Use one (§7.6) |
| Heat Score anomaly mapped from −3…+8 °C | Too low for Dhaka (§7.2) |
| `DATA_MODE=auto`: fall back to fixtures | Serves fake data as if real. Removed |
| "Regional delta table" as a fallback | No source existed. Removed |
| ORNL as a fresh MODIS source | About 6 weeks behind; fallback only |

---

## 6. Feature requirements

IDs are used in the coverage report at Stage 9. Every ID must end `done`, or `blocked` with a concrete reason.

### 6.1 Errors found in flows

Fix all 18. V1 fix and test are mandatory.

| ID | Severity | What happens now | V1 fix |
| --- | --- | --- | --- |
| E1 | Critical | Accounts, actions, trees and teams live only on the device; points can't sync, be checked or be spent | Server database and real sign-in (§6.2). Move device data to the server |
| E2 | Critical | Tapping "Road 5 · 93 · 478 m" opens "Road 6 · 87 · 522 m"; on the goal page "Nurzahan Road · 89" selects "Sher-E-Bangla Road · 88" | One immutable zone object (§7.3). Contract test: every zone in a scan returns identical `id`, `name`, `score`, `dist_m`, `h3` from `GET /zones/{id}` |
| E3 | High | A 500 m scan takes about 25 s; Ask about 30 s and says "the heat-zone tool timed out" | No third-party call in any request path. Warm scan under 2 s; cold scan returns partial results under 2 s (§7.1). Ask under 2 s |
| E4 | High | Guest taps Check feasibility: nothing for 12 s, no sheet, no error. Cause: `goal-wizard.tsx` returns silently while `zone.data` is missing | Button shows loading while the zone loads. Guest → sign-up sheet, draft kept, goal continues after sign-up |
| E5 | High | The demo leaderboard names real bodies: BRAC University Eco Club, DNCC Ward 33, Bidyanondo Green, BUET Green Club, Dhaka North and South City Corporations. `DU Green Society` is also based on a real university | Invented names only (§8.4). A test fails the build if any of these names appears in seeds or messages. Never seed a real company such as PRAN |
| E6 | High | Data & science says the heat map "is not satellite data"; the pitch says 15 NASA datasets | Landsat and ECOSTRESS in the Heat Score (§7). About page rewritten from `/sources` |
| E7 | Medium | Tapping a zone in goal step 1 shows nothing for about 8 s | Loading state on the tapped row |
| E8 | Medium | Roof figure (78,381 m²) looks larger than the zone. Cause: `plan/spots.ts` counts whole buildings by centroid | Clip roofs to the zone polygon. Invariant test: `roof_m2 + ground_m2 ≤ zone_area_m2` |
| E9 | Medium | −2.0 °C in 1 year "recommended" with 0 m² open ground, while trees reach full effect in year 8 | Recommend from real space and the timeline. Goals under 3 years are action goals (§6.6) |
| E10 | Medium | "Your zone" is Sher-E-Bangla Road at 88, the list says 84, the goal card picks Nurzahan Road | Same fix as E2. Home, Map and goal read one scan |
| E11 | Medium | NASA LST tab shows no visible layer at street zoom. V0 uses a monthly Level 6 raster | Below zoom 9 show GIBS daily MODIS with its date. Above it show our Landsat hexes in °C, with acquisition dates |
| E12 | Medium | Same point is "Mohammadpur, Dhaka" in onboarding and "Lalmatia, Dhaka" on Home. Cause: hard-coded `DEMO_PLACE` | Reverse-geocode once per scan, store it, reuse it everywhere. Delete `DEMO_PLACE` |
| E13 | Medium | Lalmatia Roof Club shows 12,800 points; its three members add up to 6,460 | Team points are computed from member ledger entries. No seeded totals |
| E14 | Medium | Nurseries says "Atmos X never sells plants", contradicting the marketplace | Change `profile.about.sections.nurseries.body` in all 10 locales when the marketplace ships |
| E15 | Low | Sensor readings are simulated | Real ingest (§7.8). Remove simulation and its labels |
| E16 | Low | Leaderboard rows and people can't be tapped | Link rows to team, org and profile pages |
| E17 | Low | React hydration error #418 and repeated 404 resource errors on Map | Render times and locale-formatted numbers only on the client. Playwright fails on any console error or 404 on `/app/map` |
| E18 | Low | Welcome hero loads late on phones, blank top half; the "Park edge 36°" chip overlaps the headline | Preload a small hero image; move the chip above the headline |

### 6.2 Accounts and sign-in

- **A1** Postgres-backed `users`, `auth_identities (provider: password | google | phone, provider_subject)`, `profiles`.
- **A2** Session: JWT in an httpOnly, `SameSite=Lax`, `Secure` (when not localhost) cookie named `atmos_session`; 30 days for users, 7 for guests; rotate on login; sliding refresh under 50 % lifetime.
- **A3** Phone OTP: `POST /auth/otp/start`, `POST /auth/otp/verify`. E.164 numbers. 6 digits, 10-minute expiry, stored hashed, 5 attempts. Limits: 5 per hour per number, 10 per hour per IP. Adapter interface `SmsProvider` with `console` (development only; refuses to run in production) and `twilio` (Twilio Verify). Other gateways plug in behind the same interface.
- **A4** Google: port `src/server/auth/google.ts` (popup code flow, `X-Requested-With` check, `postmessage` then origin fallback, claim checks) to FastAPI, keeping `useGoogleSignIn`. Client id comes from `GET /auth/google/config`. Linking to an existing email account requires proving the password (known V0 gap).
- **A5** Email + password: argon2id, ≥ 8 characters, generic error on failure.
- **A6** Guest: `POST /auth/guest` creates a server guest. `POST /auth/upgrade` turns a guest into a full user **in place**, keeping all data.
- **A7** Guests **can** see conditions, map and scan (up to 500 m), zones, projection, air, farmer alerts without saved fields, species, nurseries and leaderboards, draft a goal, and send 5 Ask messages a day. Guests **can't** log actions, join teams, save goals, track trees, add sensors, save fields, post, redeem or get notifications. Blocked actions return `403 {code:"auth.guest_restricted"}`, and the UI opens the "Create a free account" sheet.
- **A8** Limits: Ask 30/day user, 5/day guest. Cold scans 30/hour user, 10/hour guest. Auth endpoints per IP.
- **A9** One-time device import: on the first real sign-in, offer to upload V0 IndexedDB goals, trees, actions, checks, fields and photos (`POST /me/import`, idempotent by client id). The `demo` namespace and simulated sensors are never imported. Then clear imported local data. V0 local passwords can't be migrated; people register again.
- **A10** Roles: `user`, `guest`, `moderator`, `admin`, plus company and partner membership. Create the first admin with `python -m app.scripts.make_admin`.

### 6.3 Navigation and pages

- **N1** Sidebar: Home, Map, Plan, My trees, Community, Store, Farm; then Air quality, Notifications, Settings, About.
- **N2** Phones: five tabs (Home, Map, Plan, My trees, Community). Store and Profile go in a header avatar menu.
- **N3** A "+ Log action" button in the sidebar and bottom bar, and on every goal task.

Parent routes that 404 today (verified on the live site). Build them:

| ID | Route | Build as |
| --- | --- | --- |
| P1 | `/app/tree` | My trees (§6.7), a sidebar page |
| P2 | `/app/goal` | My goals: each goal's progress, target, date, next task |
| P3 | `/app/team` | My teams: teams I'm in, invites, a Discover link |
| P4 | `/app/org` | Organizations directory, linked from the Orgs leaderboard |
| P5 | `/app/species` | Full species catalog. Plan's "Show all 21" opens it |
| P6 | `/app/farm` | Redirect to `/app/farm/fields` |
| P7 | `/app/zone` | Redirect to `/app/map` |

Working pages with no link. Connect them:

| ID | Page | Link from |
| --- | --- | --- |
| L1 | `/app/log-action` | N3 |
| L2 | `/app/nurseries` | Plan, each species page, the Store |
| L3 | `/app/budget` | Plan, once a goal exists |
| L4 | `/app/farm/fields` | A "Farm" sidebar item, not only the Settings switch |
| L5 | `/app/org/[id]` | Orgs leaderboard rows |
| L6 | `/app/team/[id]` | Teams leaderboard rows |

**L7** Recheck links while signed in. The original test ran only as a guest, so log what you find.

### 6.4 Location and hexagon scan

- **H1** Draw the scan area as the outline of the hex ring: `gridDisk(center, k)` merged with `cellsToMultiPolygon`. Remove the dashed circle.
- **H2** `k = ceil(radius_m / 135)` at res 10. Verified at Dhaka: neighbour spacing 135 m. 200 m → k 2 (19 hexes), 500 m → k 4 (61), 1 km → k 8 (217).
- **H3** Presets **200 m · 500 m · 1 km**, default 200 m. Change `RADIUS_PRESETS`, the `prefs-store` default, onboarding and Settings. Keep 100 m and 300 m only if testing shows people use them. Guests stay capped at 500 m.
- **H4** Show the count beside the radius: "19 hexes · 200 m", from the scan, not from the area estimate in `cellCount`.
- **H5** Fill every hex in the ring, with no gaps. A hex with no data gets a distinct "no data" style, not a hole and not a guess.
- **L8** Ask for location on first open, with one line on why. If refused, use the city from IP (§5.2) and a search box.
- **L9** High accuracy: V0 has `enableHighAccuracy: false`. Show the accuracy circle. Re-scan when the user moves more than 100 m.
- **L10** Reverse-geocode once per scan and reuse that name everywhere.
- **L11** Keep "Try the Dhaka demo", labelled as a demo. Remove the silent Mohammadpur default: `focus` is null until resolved.

### 6.5 Real zones and reasoning

- **Z1** One zone object end to end (§7.3): the scan returns ID, name, score, distance and drivers, and map, Home, goal and zone page all read that same object.
- **Z2** Satellite heat first: score each hex from Landsat 8/9 LST, sharpened with ECOSTRESS where a pass exists, with land cover as the explanation layer. WorldCover is the always-available base, and OpenStreetMap buildings and roads add detail when Overpass answers (it is often down). Label each zone `satellite` or `estimate`.
- **Z3** Precompute Dhaka nightly and cache by H3 cell, so a scan is a database read.
- **Z4** Each driver shows its value and its °C share. The explanation only restates those numbers (§7.4).

### 6.6 Goals

- **G1** Space comes from the zone polygon: roof area clipped to the zone, open ground, street edge, planting spots.
- **G2** The recommended target comes from that space **and the timeline**. Use `treeRamp(years)`: a tree delivers 20 % at year 1, 50 % at year 3, 80 % at year 5, 100 % from year 8.
- **G3** Goals under 3 years are **action goals**: "plant 40 trees, coat 1,200 m² of roof", with the °C shown as the long-term result.
- **G4** Save goals on the server with tasks, owners and dates. Show progress on My goals.
- **G5** Guests can draft a goal. Saving opens sign-up and keeps the draft (localStorage, then server after sign-up).

### 6.7 My trees, badges and points

My trees (`/app/tree`) is where people show off what they planted, and the main reason to return every 15 days.

- **T1** Top strip: trees planted, trees alive, total points, estimated cooling added.
- **T2** Tree grid: latest photo, nickname, species, age, state badge.
- **T3** States, derived on the server and unit-tested:

  | State | Rule |
  | --- | --- |
  | Verifying | Planting action not yet verified |
  | Lost | Last check `dead`, or more than 45 days overdue and confirmed by the owner. Shows "Replant" |
  | At risk | More than 15 days overdue, or last check `stressed` twice in a row |
  | Needs water | Last check `stressed`; or tree under 2 years old with under 5 mm of rain in the last 7 days and none forecast for 3 days (IMERG → POWER, plus forecast), and it is the dry season |
  | Check-in due | Due within 2 days, or overdue up to 15 days |
  | Healthy | Otherwise |

  Thresholds live in config.
- **T4** Map view: pins of all my trees (MapLibre).
- **T5** Tree detail `/app/tree/[id]`: photo timeline from planting day, one photo every 15 days, height and health at each check-in; care tips; next check-in date; cooling estimate; share as a post; invite a friend to water it.
- **T6** Check-in: photo + self-reported health + optional height. Deterministic checks (§7.11). Tips are deterministic from species, month and recent rainfall.

**Badges** (table-driven, evaluated by the worker and on writes):

| ID | Badge | Unlocks when |
| --- | --- | --- |
| B1 | First Seed | First tree verified |
| B2 | Grove | 10 trees alive |
| B3 | 3-Month Survivor | A tree passes its 90-day check-in |
| B4 | One-Year Guardian | A tree passes its 1-year check-in |
| B5 | Monsoon Planter | A tree planted June to September |
| B6 | Roof Cooler | 100 m² of cool roof verified |
| B7 | Team Player | First team goal reached |
| B8 | Streak | 6 check-ins in a row on time |

V0's `trees100` and `p1000` may stay. `first` becomes First Seed and `trees10` becomes Grove. Remove `clan` and V0's `streak` meaning.

**Points** (`point_rules` table; these are proposed values, so keep them configurable):

| ID | Action | Points |
| --- | --- | --- |
| PT1 | Tree planted and verified | 50 per tree |
| PT2 | On-time 15-day check-in photo | 10 (V0 gave 5) |
| PT3 | Tree alive at 90 days | 50 |
| PT4 | Tree alive at 1 year | 200 |
| PT5 | Cool roof verified | 30 per 100 m² (V0 gave 30 per 10 m²) |
| PT6 | Team goal reached | 100 to each member |
| PT7 | Friend joins and plants | 25 |

Other V0 action types keep their V0 values: shrubs 12, rooftop garden 40, green wall 20, shade 25, watering 5, awareness 30.

- **PT8** Every change is a row in an append-only `points_ledger` (`amount`, `state: pending | spendable | spent | revoked`, `source_type`, `source_id`, `unlock_at`). Balances are computed from it. Points are computed on the server only.
- **PT9** Points start **pending** and become **spendable** only after that tree's 90-day check-in. This stops people logging trees just to cash out. Non-tree points unlock after the action is verified and 90 days pass; record this as an assumption, since the audit defines the rule for trees.
- **PT10** Revoked trees revoke their points. Levels use earned points; leaderboards count verified points.
- **PT11** Worker jobs unlock points, award the 90-day and 1-year points, and send due-date notifications.

### 6.8 Community

A standard community needs real accounts first.

**Profile photos.**

- **C1** Upload from camera or gallery, crop to a circle (hand-written canvas), compress to about 256 px.
- **C2** Initials on a coloured circle stay as the fallback.
- **C3** Show the photo on leaderboards, team members, activity, posts, comments and the header avatar.
- **C4** Check uploads automatically for nudity and violence (§7.12), and let people report a photo.

**Features.**

| ID | Feature | Includes |
| --- | --- | --- |
| C5 | Accounts and profiles | Phone OTP and Google sign-in; name, photo, area, bio, trees, badges, points, teams. Public profile at `/app/u/[id]` |
| C6 | Feed | Posts with photo and text, likes, comments, @mentions; filter by Area, City or Following |
| C7 | Follow | Follow people and teams; a Following feed |
| C8 | Teams | Create, invite by link or code, roles (lead, member), team goal, team chat, team activity. Chat is REST with polling every 5–10 s while open; no WebSocket service |
| C9 | Organizations | Schools, NGOs and wards with many teams, an org page and an org leaderboard |
| C10 | Events | Planting drives with date, place, RSVP, check-in at the spot (GPS within 300 m), group photo, optional sponsor |
| C11 | Leaderboards | Real points by person, team and org; by area, city and country; by week, month and all time. Month is the **calendar month, resetting so newcomers can win** |
| C12 | Notifications | Likes, comments, invites, event reminders, tree check-in due, badge unlocked, plus V0's goal progress, heat warning, farm alert, verification |
| C13 | Safety | Report and block, moderator queue, hide a post, rate limits for new accounts |
| C14 | Verified actions | Every verified action becomes a post the user can share |

Area means within 3 km of the requester, top 50 plus a "you" row. Empty boards show real empty states, not seeded rows.

### 6.9 Points store (`/app/store`)

People spend verified points on products that companies give through CSR programs. **No partner has signed yet. Launch for one pilot partner and say so in the Store.** Do not seed a real company in production; a clearly invented pilot partner exists only in demo data.

- **S1** Header: spendable points, pending points, and when pending points unlock.
- **S2** Partner rows: logo, CSR line ("<Partner> rewards Dhaka's tree planters"), products.
- **S3** Product card: photo, name, points price, stock left, "Pickup" or "Delivery".
- **S4** Filters: Can afford · Food · Home · Garden · Vouchers.
- **S5** Second tab, **Buy saplings**: saplings and planting kits from nearby nurseries, paid in taka, with commission recorded. This is the tree marketplace and the main revenue stream. Empty state until a nursery partner exists; no invented prices in production.

**Redeem flow.**

- **S6** Tap a product: details, partner, pickup points or delivery area, terms.
- **S7** Tap Redeem; confirm the points to spend.
- **S8** Get a voucher code and QR valid for 14 days, or enter a delivery address.
- **S9** Show the QR at an outlet, or receive the delivery; the order moves to Collected.
- **S10** My orders lists every redemption with its status.

**Partner portal (web, for companies).**

- **S11** Add products, set points price and stock, choose pickup outlets or delivery areas.
- **S12** See redemptions; scan or enter voucher codes at outlets.
- **S13** Download a CSR impact report: verified trees, survival rate, estimated cooling, people reached, with photos. This report is what the company pays for.

**Rules that keep it honest.**

- **S14** Only spendable points can be redeemed. Spending is a database transaction that can't overdraw or oversell.
- **S15** Limits per person per month and per device (`atmos_device` cookie).
- **S16** Every tree behind the points has a GPS photo and an automated location check (§7.11); flagged trees go to manual review.
- **S17** Points hold no cash value and can't be transferred or sold. Say so in the Store terms.

### 6.10 Company marketplace

Carbon-emitting companies register, pay for verified tree impact, and give products to the points store. The loop: a company's payment funds saplings and points, people spend points on the company's products, and the company gets a report and, later, credits.

**Sign-up.**

- **M1** Register: company name, trade licence, TIN or BIN, contact person, industry, logo. Documents are private files.
- **M2** Atmos X checks the documents before the account goes live (admin review queue).
- **M3** Emissions profile: yearly emissions in tonnes CO₂e from the company's own report, and how much it wants to offset. Label it as the company's own figure.
- **M4** Pick a package, pay, list products.

**What companies buy.**

| ID | Package | The company gets | Priced by |
| --- | --- | --- | --- |
| M5 | Tree impact package | Trees planted by local people and cared for over 3 years, with photos, survival rate and estimated CO₂ removal | Per tree |
| M6 | Carbon credits | Certified tonnes of CO₂e removed, retired in the company's name with serial numbers. **Disabled until certified (M16)** | Per tonne |
| M7 | Store listing | Its products in the points store, with its logo and redemption data | Listing fee; products given in kind |

**Dashboard.**

- **M8** Overview: trees funded and alive, estimated and certified CO₂e, people reached, products redeemed.
- **M9** Buy: packages, cart, checkout.
- **M10** Products: as S11.
- **M11** Redemptions: voucher list; scan a QR or type a code.
- **M12** Certificates and reports: retirement certificates and the CSR impact report as PDF (`reportlab`).
- **M13** Billing: VAT invoices and payment history.

**Checkout.**

- **M14** bKash, Nagad and card through SSLCommerz's hosted page; bank transfer for large orders (manual confirmation by an admin). Sandbox only in this run. Validate every result server-to-server with the Order Validation API, including the amount, and make IPN handling idempotent. **Check** hosts and fields at `developer.sslcommerz.com/doc/v4`; search results show both `sandbox.sslcommerz.com` and `sandbox-gw.sslcommerz.com`.
- **M15** Every order gets a VAT invoice (rate in config). Money for trees is held and released to nurseries and planters only after each tree is verified. Record this as ledger states; no automatic payouts.

**Credit ledger.**

- **M16** Each credit is one tonne of CO₂e tied to specific trees: tree ID, GPS, photos, species, planting date. Lots move Estimated → Verified → Sold → Retired, enforced by a state check and constraints so **no tonne is sold twice**. Certificates list serial numbers. `Sold` and `Retired` are blocked unless an admin has recorded a certified registration (standard, project ID, auditor) on the lot.

**Before selling "carbon credits" (build these rules in).**

- **M17** A tonne can be sold as a carbon credit only after the trees are registered under a recognised standard such as Verra (VCS) or Gold Standard and checked by an independent auditor. Credits usually issue years after planting.
- **M18** Until then sell only tree impact packages, with CO₂ removal labelled "estimate, not an offset". Selling estimates as offsets is greenwashing and puts both parties at risk. This text appears on the purchase page, invoice and report.
- **M19** Small plantings are usually grouped into one larger project for certification. Leave `project_id` on lots.
- **M20** Bangladesh's rules need a lawyer's check before selling credits. That is a human task (§14).

**Keeping points fair.**

- **M21** Points come only from verified tree care, never directly from a company's payment. A test proves payments create no points.
- **M22** Companies set points prices within limits Atmos X sets, so 1,000 points buy about the same value in every listing: declared value × rate, ± a config tolerance.
- **M23** S14–S17 apply everywhere.

### 6.11 Business model items

| ID | Item | In this run |
| --- | --- | --- |
| R1 | Tree marketplace commission | Build (S5) |
| R2 | CSR partner store fees | Build: listing fee, recorded fee per verified tree |
| R3 | Sponsored drives | Build: sponsor logo on the event and certificate (C10) |
| R4 | CSR impact reports | Build the report (S13). Subscription billing is deferred |
| R5 | Carbon credits and grants | Ledger only (M16) |
| R6 | Planting service | **Deferred.** Needs real local teams; nothing to build against yet |
| R7 | Adopt a tree | **Deferred.** Needs R6's operations and foreign payments |
| R8 | Cool-roof leads | **Deferred.** No partner |
| R9 | Paid org dashboards | Build org exports; paid plans deferred |

Everything for citizens and farmers stays free.

**Keeping costs down.**

- **R10** Cache scans by H3 cell (Z3).
- **R11** The audit's AI cost limits are moot with no LLM, but keep the 5-a-day guest Ask limit.
- **R12** Compress check-in photos on the phone before upload (existing `capture.ts`, ≤ 1600 px).
- **R13** Partners fund rewards, so points cost Atmos X nothing to honour.

**Keeping people coming back.**

- **R14** The 15-day check-in with a streak badge.
- **R15** Monthly area leaderboards that reset.
- **R16** Store products refreshed each month is operations work. Show product dates so stale listings are visible.

### 6.12 Ask Atmos without an LLM

Keep the panel, the SSE contract (`warning`, `token`, `sources`, `action`, `notice`, `done`, `error`), source chips, suggested actions that navigate only on tap, and the daily counter.

- **K1** `services/ask.py`: classify the message into an intent with keyword lists per language (port and extend `kindOf` from `server/ai/canned.ts`, which covers only en/bn/ur), falling back to the screen's default topic. Suggestion chips send intent IDs directly, so they always work.
- **K2** Intents: `why_hot`, `temp_now`, `forecast`, `normal`, `air_now`, `air_advice`, `farm_alerts`, `tree_care`, `tree_due`, `nurseries`, `species`, `goal_progress`, `points`, `data_sources`, `help`.
- **K3** Each intent reads the same services as the screens and fills `server.ask.answer.<intent>` templates in 10 languages with the user's units and digits. Answers are complete sentences with real numbers.
- **K4** Warnings first, always.
- **K5** Unknown question: say plainly what Atmos can answer and offer chips. Never guess.
- **K6** No medical diagnosis and no pesticide, fungicide or fertiliser doses: keyword intents return fixed safety text and refer to a doctor or the local agriculture office (DAE in Bangladesh).
- **K7** Remove photo attachment from Ask. Point to the tree check-in instead.
- **K8** Answer in under 2 s. Store feedback (`POST /ask/{id}/feedback`) and unanswered questions, so the team can extend intents.
- **K9** Rewrite "AI chat" copy. The name "Ask Atmos" stays.

### 6.13 Carried over unchanged in behaviour

Port these from V0 and keep them working: onboarding, Home sections, map interactions, projection sliders, species detail, budget, contribution card, air screens, Farmer Home, fields and alert detail, invite links with QR, settings, Presentation mode (now backed by a server demo user, §8.4), in-app camera with GPS and time seal, install banner, offline indicator, native digits and RTL number isolation.

Also build what V0 skipped, in the design system with no external design file:

- **W1** Real landing page at `/` (it is a placeholder): hero with "Open the app" and "Install app"; the problem; how it works (scan → understand → plan → act → track); NASA data used, from `/sources`; feature grid; science notes; team and NASA Space Apps credit; footer attributions. Metadata, `sitemap.ts`, `robots.ts`, hreflang.
- **W2** Web push: VAPID, `POST /push/subscribe`, quiet hours 22:00–07:00 local, SW `push` and `notificationclick`, a Settings toggle, disabled when keys are absent.

---

## 7. Engines and science

Pure functions in `apps/api/app/engines/`, unit-tested, no I/O. Every constant in a config module with a comment on its source.

### 7.1 Heat pipeline

A **chunk** is an H3 res-7 cell (about 5.2 km², 343 res-10 cells). Jobs compute a chunk with its k=1 neighbours in one read, so nearby scans become warm.

For each job:

1. **Scenes:** search as in §5.2 over the last 120 days. Keep scenes covering the window. Keep at most 8, most recent first, skipping those under 20 % clear in the window (verified in Dhaka: clear share varies from 34 to 100 % for scenes under 35 % cloud).
2. **Read** `lwir11` and `qa_pixel` windows with at most 4 concurrent reads. Reuse the token.
3. **Mask and convert** (§5.2). Per-pixel median across scenes.
4. **Aggregate** to res-10: mean of pixel centres in each cell. Keep `valid_px` and `n_scenes`. A hex needs ≥ 8 valid 30 m pixels and ≥ 2 clear observations; otherwise widen to 365 days; otherwise use the fallback chain.
5. **Land cover:** WorldCover class shares per hex. `sealed = built`; `green = tree + shrub + grass + crop + wetland + mangrove`; `water`.
6. **NDVI:** median of clear HLS observations over 120 days.
7. **Dark surface:** Landsat albedo per Liang (2001), `α = 0.356·blue + 0.130·red + 0.373·nir + 0.085·swir16 + 0.072·swir22 − 0.0018`; `dark_roof_pct` = share of built pixels with `α < 0.15`. It sees surfaces at 30 m, not individual roofs, so label it "dark surfaces" in the explanation.
8. **Night:** ECOSTRESS night passes if available, else the median of MODIS 8-day `LST_Night_1km` (Terra and Aqua) over 120 days.
9. **ECOSTRESS sharpening** (token only): for each pass within 09:00–15:00 local solar time, with `cloud = 0`, `water = 0`, `LST_err ≤ 2 K`, compute hex mean minus the median over the job window. Take the median across passes. Blend the **relative** pattern: `anom_day = 0.7·landsat_anom + 0.3·eco_anom` where both exist. ECOSTRESS never replaces the absolute Landsat value, because passes happen at different hours. The weights are a design choice in config.
10. **Baseline:** `baseline_lst_c` = median hex LST in the job window. `landsat_anom = hex − baseline`.
11. **OSM enrichment** (separate low-priority job, may fail): building and road shares and buildings per hectare for explanations, and names.
12. **Write** `heat_cells` rows with `pipeline_version` and `composite_id`. Set `label = satellite` if Landsat met step 4, else `estimate`.

**Land-cover estimate** (only when no LST exists for a hex): port V0's `est_c` formula from `heat/config.ts`, driven by WorldCover shares instead of Overpass and by today's Tmax. Label `estimate`. Its coefficients are assumptions and the UI says so.

**Dhaka precompute:** the worker runs this for region south 23.69, west 90.33, north 23.90, east 90.50 (about 405 km², about 26,900 hexes) nightly and at first boot. Verified feasible in about 30 s of pixel reads. Regions live in a `precompute_regions` table.

**Scan flow:** `GET /zones` computes the center cell and `k`, reads `heat_cells`, and builds or loads the scan.

- If every cell is present: return `status: complete`.
- If not: enqueue deduplicated jobs and return immediately with `status: partial`, present cells filled, the rest `no_data`, and a `job_id`. The client polls `GET /scan-jobs/{id}`, shows progress and re-fetches. Target: partial response under 2 s, complete within about 30 s for a cold area.

### 7.2 Heat Score v1 (per hex; independent of any scan)

```
score = 100 × ( 0.55 · f(anom_day,   −6, +6)
              + 0.15 · f(anom_night, −3, +3)
              + 0.15 · sealed
              + 0.10 · (1 − green)
              + 0.05 · pop_pct )
f(x, lo, hi) = clamp((x − lo) / (hi − lo), 0, 1)
```

- If night or population is `null`, drop that term and re-normalize the rest. Report which terms were used.
- A hex that is ≥ 50 % water is not eligible for zones.
- **Calibration (verified on Dhaka, March–May 2026, 4 scenes, 24,160 hexes, without night or population):** LST anomaly vs the city median of 32.2 °C was P5 −4.0, P95 +3.3. Built ≥ 90 % median +1.2; tree ≥ 50 % −1.8; water ≥ 50 % −3.4. Pearson r(LST, built) +0.52. Mapping −6…+6 gives built-up blocks a median of about 72, tree-heavy hexes about 29, water about 27. The older −3…+8 gave built-up blocks only about 57. Over 1 km at Mohammadpur in Sep–Nov 2026, r(LST, built) was +0.60 and r(LST, tree) −0.61, the hottest hexes were 99–100 % built with no trees, and the coolest were tree-covered.
- **Acceptance on real Dhaka output:** built ≥ 90 % median between 65 and 85; tree ≥ 50 % and water ≥ 50 % medians under 45. If it fails, retune the config constants, not the data, and record why in `docs/v1/decisions.md`.
- Weights are a transparent index, not physics. Publish the formula on `/sources` and About.

### 7.3 Zones and the one-object rule

- Build a zone from a scan: connected components (H3 neighbours) of hexes in the scan's top quartile, ranked by mean score. Port `clusterHotCells` and its flat-scan rule. At most 12 zones. `near_tie` when a neighbouring rank differs by ≤ 3.
- **Persist it.** `scans (id, center_cell, k, place_label, composite_id, pipeline_version, created_at)` and `scan_zones (id, scan_id, rank, name, score, lst_c, label, dist_m, centroid, h3[], drivers jsonb, causes jsonb, why jsonb, what_if jsonb, area_km2, area stats)`. `(center_cell, k, composite_id)` is unique, so everyone in that cell shares a scan.
- `id` is `z_<8 hex chars of scan id>_<rank>`. It **refers to one row and is never recomputed.**
- `GET /zones/{id}` reads that row. It never re-scans, never falls back to "a nearby zone". An unknown id is a 404.
- `dist_m` is measured from the center cell's centroid and stored. The client never recomputes a displayed distance.
- Name: one label per zone, stored once. Nearest named OSM place or road when enrichment exists, else Nominatim for the centroid, else `zone.unnamed`. Store names per language as a map; never re-derive them.
- Goals reference `scan_zones.id` and also copy `zone_name` and `centroid`. Scans referenced by goals are never pruned; others after 30 days.
- A new composite makes a new scan. An older zone page stays valid and shows "Newer satellite data is available" with a link.
- Home, Map, goal picker and Ask all call `useScan()` with the same `prefs.radius_m`, so they share one scan ID.

### 7.4 Drivers and "why"

- **°C share from measured data:** per region and composite, fit OLS of `anom_day` on `sealed`, `green`, `water` and `dark_surface` across hexes (`driver_coefficients` table, refreshed nightly; needs ≥ 500 hexes, otherwise use V0's coefficients, labelled `estimate`). `adds_c = coef × (value − regional mean)`. Show each driver's value and `adds_c`, plus "other factors" as the residual, and the fit's R² on About.
- `causes[]`: the top 3 by `adds_c`, as `{code, params}` (`cause.sealed_surface`, `cause.low_green`, `cause.dark_surfaces`, `cause.dense_buildings`, `cause.wide_roads`, `cause.dense_population`, `cause.hot_nights`).
- `why`: 2–3 deterministic sentences as I18nText, selected by rule from the same numbers: hotter or cooler than the area by X °C; the biggest one or two causes; what would help most. In all 10 languages. Remove `why_text` and `SourceChips ai`.

### 7.5 What-if

`what_if_green`: add 10 points of green. `lst_drop_c = −coef_green × 0.10`, floored at 0. `score_after` = re-score with new `green` and new `anom_day`, and label it `estimate`.

### 7.6 History and projection

- **History:** hot season = 3 hottest consecutive months from POWER daily (port `summarize`). For each year from 2003: median MOD11A2 day and night LST at the chunk centre in those months. `history_kind: 'lst'`. Worker job, stored forever per res-7 cell. About 280 composites per location, so run with bounded concurrency. Partial history shows what exists, with an empty state if none. It is 1 km context, so label it.
- **Projection, `without_c`:** hot-season surface temperature now + warming. Warming is the NEX-GDDP-CMIP6 ssp245 ensemble-mean delta of `tasmax` (hot season, a few models and sampled years, vs historical) when cached, else the observed MODIS linear trend. **Never add both.**
- **`with_c`:** `without_c` minus ramped cooling (§7.10). Say it is surface temperature and show assumptions.

### 7.7 Conditions

Port `weather/*`.

- `air_c`, RH, wind: Open-Meteo current. `feels_c`: NOAA heat index (port; returns air temperature below 80 °F). `heat_risk`: V0 bands.
- `forecast[]`: GEOS-FP local-day Tmax and Tmin. **Sanity rule:** if a value differs from Open-Meteo by more than 3 °C (config), use Open-Meteo for it and set `disagreement: true`. Each day carries `source`. On 4 Nov this rule kept GEOS-FP Tmax (32.0 vs 30.5) and took Open-Meteo Tmin (24.4 vs 20.3), so show the source on that row.
- `normal_c`, `anomaly_c`: POWER normal (§5.2); `anomaly_c = today's forecast Tmax − normal`, labelled "today's high vs normal".
- `recent[]`: POWER last 7 valid days, with `as_of`.
- **BMD (Bangladesh only). Verified from an official BMD bulletin, Apr 2026:**
  - Heat wave by Tmax: mild 36.0–37.9, moderate 38.0–39.9, severe 40.0–41.9, very severe ≥ 42.0 °C.
  - Cold wave by Tmin: mild 8.1–10.0, moderate 6.1–8.0, severe 4.1–6.0, very severe ≤ 4.0 °C. V0 merges severe and very severe; fix it.
  - Rain per 24 h: light 1–10, moderate 11–22, moderately heavy 23–43, heavy 44–88, very heavy > 88 mm.
  - BMD is reviewing its rainfall classes, so keep all of these in config.
- `warnings[]`: computed, `source: 'local'`, in 10 languages (§4 rule 10). Worker creates `heat_warning` notifications once per event per 0.25° cell.

### 7.8 Air

Port `air/*`. AQI: US EPA 2024 PM2.5 breakpoints (0–9.0, 9.1–35.4, 35.5–55.4, 55.5–125.4, 125.5–225.4, 225.5+).

- `pm25` now follows §5.3, with the source named. `nasa_pm25` carries GEOS-CF's value for the same hour when cached, so people can compare.
- `forecast[]`: GEOS-CF v2 daily means → CAMS.
- `stations[]`: nearest 5 within 25 km from OpenAQ.
- **Sensors:** `POST /sensors` returns an ingest token once (stored hashed). `POST /sensors/ingest` with `X-Sensor-Token` validates ranges, limits to 1 reading per minute, stores the reading. Offline after 6 h. Add-sensor screen shows the token and a curl example. Remove all simulation.

### 7.9 Farmer alerts

Port all 9 rules from `farm/alerts.ts` to `engines/farmer.py` with existing thresholds, crops (`boro`, `aman`, `aus`, `potato`, `wheat`, `jute`, `vegetables`, `maize`), stages and I18nText codes. Then:

- Rain over the last 72 h comes from IMERG when available; add a `heavy_rain` rule with BMD categories.
- Drought: add SMAP `sm_rootzone_wetness`, with POWER 30-day rain and Open-Meteo ET0 as fallback. Thresholds in config, documented, and labelled as rules of thumb.
- Cold wave uses the 4 official bands.
- Lightning: weight by LIS/OTD climatology when present.
- The alert's sources list only what was actually used. The worker creates `farm_alert` notifications for saved fields. Cache IMERG and SMAP per 0.1° cell per day.
- Store "I've done it" on the alert.

### 7.10 Planning

Port `plan/*`.

- **Cooling coefficients** (`plan/coeffs.ts`; conservative order-of-magnitude values from urban-heat literature: Ziter et al. 2019, Schwaab et al. 2021, Santamouris 2014): `plant_tree` 0.0006, `plant_shrubs` 0.0001, `rooftop_garden` 0.0003, `cool_roof` 0.0004 per 10 m², `green_wall` 0.00015 per 5 m², `shade_structure` 0.0002, all °C per unit for 1 km², divided by zone area floored at 0.1 km². Show as `estimate`.
- **Capacity** (`feasibility.ts`): `trees = ground_m2/25 + roadside_m/8`, `roof = roof_m2 × 0.6`. 70/30 trees and roofs, shifting when one side runs out. Verdict from need ÷ capacity: ≤ 0.6 yes, ≤ 1 stretch, else no.
- **Achievable by date:** `achievable_c(t) = cap.trees × tree_c × treeRamp(t) + cap.roof_m2 × roof_c + shade`. Recommend the largest target at or under 85 % of that. Under 3 years, the goal is stated in actions, with the long-term °C alongside.
- **Costs:** `cost_tables` by country from `REF_COSTS` (BD: tree 450, roof 90/m², shade 18,000, care 300/year, BDT; default: USD 25, 6, 600, 10). All marked `reference`. Humans can refine them (§14).
- **Species:** port the 20 trees plus madhabilata from `plan/species-data.ts` to a table. Rank by canopy and water fit to the zone's drivers. Outside Bangladesh: by climate band from POWER normals (tropical wet, tropical dry, arid, temperate, cold), a small table of widely planted urban trees, `estimate: true`, `price: null`, labelled "commonly planted, check with a local nursery". Do not claim a species is native unless a source says so.
- **Steps, next task, care plan:** message templates for 10 languages. Replace the en/bn/ur strings inside `plan.ts`.
- **Planting spots:** port `spots.ts`, worker-only because of Overpass, cached 7 days and stored. **Clip** ground and roofs to the zone polygon with `shapely`. Fix the crude building subtraction. `suitability` may also use low NDVI and high LST.
- **Budget:** per-action cost + water + care.

### 7.11 Action verification (deterministic)

`POST /actions` computes points on the server and runs these checks, each stored in `checks[]`:

| Check | Pass when |
| --- | --- |
| `gps_present` | Coordinates supplied, accuracy ≤ 100 m |
| `gps_near` | Within 300 m of the goal zone's polygon, or no target |
| `location_plausible` | WorldCover at the point is not water; not inside a mapped building for ground actions; speed from the user's previous action ≤ 120 km/h |
| `time_recent` | `taken_at` within 24 h, not more than 10 min ahead |
| `capture_source` | In-app camera (recorded), or EXIF time and GPS agree with the claim |
| `not_duplicate` | Perceptual hash (`imagehash`) not within distance 6 of any earlier photo |
| `content_plausible` | Plant actions: excess-green share `2g − r − b` over a threshold. Cool roof: bright, low-saturation share over a threshold. A rough heuristic, documented as such |

All pass → `verified`. Otherwise `pending`, with the reason shown, and it enters review.

- A reviewer is a **different person**: a team lead or member, or a moderator. V0's self-confirm button goes away.
- Flagged trees go to the moderator queue. Rejected actions revoke points.
- Limits per user per day.
- Remove `confidence`, `seen` and "What the AI saw". Show the checks instead.

### 7.12 Photos and moderation

- `POST` multipart; validate MIME and size (≤ 8 MB); re-encode with Pillow; store original privately, a 1080 px public copy and a 320 px thumb. **Strip EXIF from public copies.** Keep precise tree coordinates visible only to the owner, the team and moderators; public posts show area only.
- Moderation states: `pending`, `approved`, `rejected`. Public surfaces (avatars, posts, comments, events) show only `approved`; the author always sees their own.
- `MODERATION_PROVIDER=manual`: all go to the queue. `google_vision`: `POST https://vision.googleapis.com/v1/images:annotate?key=…` with `SAFE_SEARCH_DETECTION`; `adult` or `violence` at `LIKELY` or above is rejected and queued, and any error fails closed to the queue. **Check** the current API reference.
- Anyone can report a photo or post. Reports enter the queue. Moderators hide, restore, warn and block.
- New accounts (under 7 days) have lower post and comment limits.

---

## 8. Architecture

### 8.1 Repo layout

```
atmos-x/
  apps/
    web/   Next.js 16 (npm)
    api/   FastAPI + worker (uv, pyproject.toml)
      app/
        main.py config.py db.py deps.py worker.py
        models/    schemas/    routers/    services/
        engines/   pure science, no I/O
        providers/ one module per data source; all I/O
        scripts/   verify_sources, make_admin, seed_demo, scan
      alembic/  tests/  data/ (gitignored)
  docs/
    api-contract.md   human-readable copy of §9
    handoff/v1.md     final report
    v1/               decisions.md, source-check.md, audit-coverage.md
  docker-compose.yml  Makefile  .env.example
```

No JS workspaces.

`Makefile` targets: `env`, `db`, `api`, `worker`, `web`, `dev`, `migrate`, `seed`, `gen-client`, `static-data`, `verify-sources`, `precompute`, `test`, `e2e`.

### 8.2 Runtime

```
Browser / PWA ── same origin ──► Next.js :3000 ── rewrites /api/v1/*, /media/* ──► FastAPI :8000
   │  GIBS + basemap tiles only                                                      │
   ▼                                                                                 ▼
public tile servers                                                     Postgres 16 + PostGIS :5432
                                                                                     ▲
                 Worker (same code, APScheduler + jobs table) ───────────────────────┘
                    │
   Planetary Computer (Landsat, HLS, MODIS, WorldCover) · LP DAAC (ECOSTRESS) · POWER · NCCS (GEOS-FP,
   GEOS-CF v2, CMIP6) · GES DISC (IMERG) · NSIDC (SMAP) · GHRC (LIS/OTD) · ORNL · Open-Meteo · OpenAQ
   · Overpass · Nominatim
```

**Request path rule:** a user request may read Postgres and call only Open-Meteo or Nominatim, with a 4 s timeout and a cached fallback. Everything else runs in the worker.

**Data flow:** source → provider (fetch, validate, normalize units to °C, mm, µg/m³, UTC) → engine (pure maths) → Postgres → service → router (Pydantic) → OpenAPI → generated client → hook → screen.

### 8.3 Backend stack

Python 3.12+, uv, FastAPI, Pydantic v2, pydantic-settings (reads root `.env`, then `apps/api/.env`, `extra='ignore'`), SQLAlchemy 2 async, asyncpg, Alembic, GeoAlchemy2, `h3` v4, httpx, tenacity, `rasterio`, numpy, `shapely`, `h5py`, `earthaccess` (`login(strategy="environment")` reads `EARTHDATA_*`; token takes precedence), Pillow, `imagehash`, PyJWT, `pwdlib[argon2]`, `python-multipart`, APScheduler, `maxminddb`, `pywebpush`, `reportlab`. Tests: pytest, pytest-asyncio, respx, ruff.

Do not add `openai`, `earthengine-api`, `xarray` or `netCDF4` unless a real read proves you need them; GEOS is plain HTTP and IMERG and SMAP are HDF5.

Port from TypeScript, keeping names:

| V0 | V1 |
| --- | --- |
| `server/heat/{score,config}.ts` | `engines/heat.py` |
| `server/heat/landcover.ts` | `providers/osm.py`, `services/enrichment.py` |
| `server/weather/{bmd,heat-index,archive}.ts` | `engines/{bmd,heatindex,normals}.py` |
| `server/weather/{forecast,conditions}.ts` | `providers/open_meteo.py`, `services/conditions.py` |
| `server/air/{aqi,air}.ts` | `engines/aqi.py`, `services/air.py` |
| `server/farm/alerts.ts` | `engines/farmer.py`, `services/farm.py` |
| `server/plan/{coeffs,feasibility,projection}.ts` | `engines/cooling.py` |
| `server/plan/{plan,species,spots}.ts` | `services/plan.py`, `services/species.py`, `services/spots.py` |
| `server/geo/geo.ts`, `server/places/nurseries.ts` | `providers/nominatim.py`, `services/nurseries.py` |
| `server/auth/google.ts` | `services/auth_google.py` |
| `lib/data/local/{points,trees-logic,teams-logic,guest}.ts` | `engines/progress.py`, `services/*` |
| `server/ai/canned.ts` | `services/ask.py` |

Port the unit tests too (`score.test.ts`, `weather.test.ts`, `plan.test.ts`, `aqi.test.ts`, `points.test.ts`, and others).

### 8.4 Frontend changes

- `src/lib/data/hooks/*`: **keep every hook name**; swap internals to the generated client. Add hooks for feed, follows, events, store, orders, company. Update `types.ts` to match the contract, or re-export generated types.
- `next.config.ts`: rewrites to `API_ORIGIN`. Read Next's rewrites doc first and test that SSE passes through. Keep the security headers.
- `public/sw.js`: move stale-while-revalidate to `GET /api/v1/{conditions,zones,air,farm/alerts,nurseries,species}`. Never cache authenticated or private responses, posts, chat or store data. Bump cache names.
- `src/proxy.ts`: keep the `atmos_device` cookie. Skip i18n for `/media`.
- `lib/location.tsx`: §6.4, moved to `/api/v1/geo/*`.
- `components/map/*`: hex outline, presets, satellite label, LST layer (E11). Replace `resForRadius` and `cellCount`.
- **Source chips:** show `kind`, source name and `as_of`, and "demo", "stale" or "estimate" states. Remove the "AI" chip.
- **Demo mode:** "Try the Dhaka demo" and `?demo=1` create a fresh server user cloned from the demo story (`POST /auth/demo`), `is_demo = true`, excluded from real leaderboards, deleted after 7 days. Everything demo shows a "Demo" chip. Port the story from `seed/story.json`; invent community names, for example Campus Green Society, Ward 7 Volunteers, Shade Street Collective, Riverbank Greeners. Heat data is real.
- **Copy:** rewrite every "v0", "simulated", "AI", "OpenStreetMap estimate" string. About page sections come from `/sources`.
- **Translations:** write all new strings for all 10 locales yourself. bn and ur human strings are never overwritten; mark new machine strings per the existing convention. `i18n:check` must pass.
- **Delete at the end (Stage 7):** `src/app/api/v0/**`, `src/server/**`, `src/lib/data/seed/**`, most of `src/lib/data/local/**` (keep the import step, drafts and prefs), `scripts/{translate,snapshot,probe}.ts`, `.translate-cache.json`. Remove packages only `src/server` used, such as `openai`, `@turf/turf`, `rbush`, and `zod` if unused.

### 8.5 Environment

The root **`.env.example`** is the source of truth; `cp .env.example .env`. `make env` copies only `API_ORIGIN`, `ATMOS_BUILD_ID` and `NEXT_PUBLIC_*` into `apps/web/.env.local`, so **the Next server never holds a backend secret**.

`make env` must not overwrite an existing `.env.local` that holds other keys: move it to `.env.local.v0.bak` without printing it. If the root `.env` still holds only V0 keys, move it to `.env.v0.bak`. Before doing either, extend the root `.gitignore` with `.env*` and `!.env.example`.

Replace `apps/web/.env.example` with a pointer plus the web variables, with no values that look real.

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `APP_ENV`, `LOG_LEVEL` | server | yes | Mode and logs |
| `DATABASE_URL` | server | yes | Postgres |
| `JWT_SECRET` | server secret | yes | Sessions. Generate locally with `openssl rand -hex 32` if empty or placeholder |
| `COOKIE_SECURE` | server | yes | Cookie flag |
| `PUBLIC_WEB_ORIGIN` | server | yes | Invite and payment URLs |
| `DATA_MODE` | server | yes | `live` or `fixture` |
| `DATA_DIR` | server | yes | Uploads and static files |
| `EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD`, `EARTHDATA_TOKEN` | server secret | no | ECOSTRESS, IMERG, SMAP, LIS/OTD, GPW |
| `OPENAQ_API_KEY` | server secret | no | Stations |
| `OPEN_METEO_API_KEY` | server secret | before commercial launch | Open-Meteo paid tier |
| `OSM_USER_AGENT` | server | yes | OSM policy |
| `OVERPASS_URLS` | server | yes | Mirrors |
| `ASK_DAILY_LIMIT_USER`, `ASK_DAILY_LIMIT_GUEST` | server | yes | Limits |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | server (secret) | no | Google sign-in |
| `SMS_PROVIDER` | server | yes | `console` or `twilio` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | server secret | for production OTP | SMS |
| `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, `SSLCOMMERZ_SANDBOX` | server secret | for checkout | Payments |
| `MODERATION_PROVIDER`, `GOOGLE_VISION_API_KEY` | server secret | no | Moderation |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | server secret | no | Web push |
| `API_ORIGIN` | web server | yes | Rewrites |
| `ATMOS_BUILD_ID` | web build | no | SW stamp |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MAP_STYLE_URL`, `NEXT_PUBLIC_MAP_STYLE_URL_DARK`, `NEXT_PUBLIC_MAPLIBRE_WORKER_URL`, `NEXT_PUBLIC_TIME_ZONE`, `NEXT_PUBLIC_DEMO_LAT`, `NEXT_PUBLIC_DEMO_LNG` | **public** | see file | Client config |

**Removed:** `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MODEL_CHEAP`, `AI_DAILY_REQUEST_CAP`, `OPEN_METEO_BASE_URL`, `OPEN_METEO_*_URL`, `NOMINATIM_URL`, `NASA_POWER_URL`, `ATMOS_CACHE_DIR`, `GOOGLE_OAUTH_TOKEN_URL`, `ATMOS_LOG`. Tests mock upstreams instead of pointing env at dead hosts.

If you add a variable, add it to `.env.example` and this table in the same commit. On startup, log which optional integrations are off, by name only. In `production`, refuse a placeholder `JWT_SECRET`, `DATA_MODE=fixture` or `SMS_PROVIDER=console`.

### 8.6 Database tables

Use Alembic. Enable `postgis`. Index every query path; run `EXPLAIN` on leaderboards, feed, due trees and nearby queries.

- **Identity:** `users`, `auth_identities`, `otp_challenges`, `profiles`, `follows`, `blocks`.
- **Heat:** `precompute_regions`, `composites`, `heat_cells`, `driver_coefficients`, `scans`, `scan_zones`, `zone_history`, `place_labels`, `jobs`, `data_cache`.
- **Planning:** `goals`, `goal_tasks`, `goal_drafts`, `species`, `cost_tables`, `planting_spots`.
- **Actions and trees:** `action_types`, `actions`, `action_reviews`, `photos`, `trees`, `tree_checks`.
- **Points:** `point_rules`, `points_ledger`, `badges`, `user_badges`.
- **Community:** `teams`, `team_members`, `team_messages`, `orgs`, `org_members`, `posts`, `post_likes`, `comments`, `mentions`, `events`, `event_rsvps`, `event_checkins`, `reports`, `moderation_actions`, `notifications`, `push_subscriptions`, `usage_counters`.
- **Air and farm:** `sensors`, `sensor_readings`, `farm_fields`, `alert_acknowledgements`.
- **Ask:** `ask_messages` (intent, screen, language, helpful; no precise location).
- **Store:** `partners`, `partner_outlets`, `partner_members`, `products`, `redemptions`, `vouchers`, `nursery_partners`, `nursery_products`, `sapling_orders`.
- **Company:** `companies`, `company_documents`, `company_members`, `emissions_profiles`, `package_orders`, `tree_allocations`, `credit_lots`, `credit_lot_trees`, `retirements`, `certificates`, `invoices`, `payment_transactions`, `payout_ledger`.

Team size ≤ 5 is enforced in the service and by a trigger. Team totals are a view over the ledger.

### 8.7 Worker jobs

| Job | Schedule | Notes |
| --- | --- | --- |
| Dhaka precompute | Nightly, first boot | §7.1 |
| Chunk compute | On demand | Deduplicated by chunk + composite. 2 concurrent |
| OSM enrichment, planting spots | Low priority, retries | Failure never blocks |
| Zone history | On demand, low priority | Forever |
| CMIP6 delta | On demand, low priority | Forever per 0.25° cell |
| GEOS-FP refresh | Every 6 h per active 0.25° cell | 120 s timeout, walk back runs |
| GEOS-CF v2 refresh | Daily after the 09z run, per active cell | |
| IMERG, SMAP | Daily per active 0.1° cell | Token only |
| Driver coefficients | Nightly | |
| Tree due, unlocks, milestones, badges | Daily | Idempotent |
| Event reminders, voucher expiry | Hourly | |
| Heat and farm notifications | Daily | Once per event |
| Cache, scan and demo user cleanup | Daily | Never scans used by goals |

A cell is "active" if a saved goal, tree, field or recent scan uses it.

### 8.8 Cache TTLs

| Data | TTL | Served when stale? |
| --- | --- | --- |
| `heat_cells` | Until next composite, about nightly | Yes, with dates |
| Open-Meteo current | 30 min | Yes, with `stale` |
| GEOS-FP | 6 h | Yes, up to 24 h |
| Air | 1 h; GEOS-CF 24 h | Yes |
| POWER normals | 30 days | Yes |
| POWER recent | 6 h | Yes |
| Nominatim labels | 30 days | Yes |
| Overpass enrichment, nurseries | 7 days | Yes |
| IMERG, SMAP | 24 h | Yes |
| History, CMIP6, LIS/OTD | Forever | Yes |
| Planetary Computer token | Until `msft:expiry` minus 5 min | No |

---

## 9. API contract v1

Served at `/api/v1`, field names in snake_case. FastAPI's OpenAPI document is the machine source of truth; `docs/api-contract.md` is the readable copy. Stable `operationId`s. Run `make gen-client` after any change.

```ts
type DataKind = 'observation'|'model'|'forecast'|'derived'|'estimate'|'reference'|'demo'
type Source = { id: string; name: string; url?: string; as_of?: string; kind?: DataKind; resolution_m?: number }
type Meta = { live: boolean; stale: boolean; generated_at: string; sources: Source[]; pipeline_version?: string }
type I18nText = { code: string; params?: Record<string, string|number> }
type LatLng = { lat: number; lng: number }
type Err = { code: string; message: string; fields?: Record<string,string>; retry_after?: number }
```

`live: true` means fresh from its normal source. `stale: true` means last-good data beyond its TTL. Structured text is I18nText; only Ask returns finished text.

**Auth and me**

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | Email + password |
| POST | `/auth/guest`, `/auth/upgrade`, `/auth/demo` | Upgrade keeps data |
| POST | `/auth/otp/start`, `/auth/otp/verify` | `{phone}`, `{phone, code}` |
| GET | `/auth/google/config` | `{enabled, client_id}` |
| POST | `/auth/google` | `{code}`, requires `X-Requested-With` |
| GET | `/auth/me` | `User` or 401 |
| GET/PATCH | `/me/profile` | `display_name, avatar_url, bio, area, home, radius_m, lang, unit, area_unit, theme, farmer_mode, ask_on, onboarded` |
| POST | `/me/avatar`, `/me/import` | Multipart; idempotent import |
| GET | `/me/stats` | `{points:{spendable,pending,next_unlock_at}, level, badges, trees, trees_alive, actions, cooling_c, rank_area}` |
| GET | `/users/{id}` | Public profile |

**Heat now**

`GET /conditions?lat&lng&lang` → `{ place, time, air_c, feels_c, humidity, wind_kmh, heat_risk, bmd_level, cold_level, normal_c, anomaly_c, recent:[{date,tmax_c,tmin_c,rain_mm}], forecast:[{date,tmax_c,tmin_c,feels_max_c,rain_mm,bmd_level,heat_risk,source,disagreement}], warnings:[{source:'BMD'|'local',level,text:I18nText,until}], meta }`

**Zones**

`GET /zones?lat&lng&radius_m&lang` →
```ts
{ scan: { id, center: LatLng, center_cell, radius_m, k, h3_res: 10, cell_count, place,
          status: 'complete'|'partial'|'unavailable', job_id: string|null,
          acquired: { lst_from, lst_to, lst_scenes, ndvi_date, worldcover_year, ecostress_passes },
          baseline_lst_c, method: 'landsat'|'modis'|'landcover' },
  hexes: [{ h3, score, lst_c, label:'satellite'|'estimate'|'no_data' }],
  zones: ZoneSummary[], my_zone_id, meta }
ZoneSummary = { id, scan_id, name, score, lst_c, label, dist_m, rank, near_tie, centroid, h3: string[], area_km2, drivers: ZoneDrivers }
ZoneDrivers = { sealed_pct, green_pct, water_pct, ndvi, dark_roof_pct, pop_density_km2, night_lst_c,
                estimated: string[], contributions: [{driver, value, unit, adds_c}], other_c, as_of }
```

`GET /zones/{id}?lang` → `ZoneSummary & { air_c, feels_c, causes: I18nText[], why: I18nText[], what_if_green:{add_green_pct,score_after,lst_drop_c}, history:[{year,day_lst_c,night_lst_c}], history_kind:'lst', superseded_by: string|null, meta }`. A row read; identical base fields to the scan.

`GET /scan-jobs/{id}` → `{status, progress, done_cells, total_cells}`
`GET /zones/{id}/projection?trees&roof_m2&shade` → `{years, without_c, with_c, warming_source:'cmip6'|'modis_trend'|'none', assumptions: I18nText[], meta}`
`GET /zones/{id}/planting-spots` → GeoJSON FeatureCollection (`kind: ground|roof|roadside`, `area_m2`, `suitability`) + `totals`
`GET /map/gibs` → `{layer, date, tile_url, max_zoom}`

**Goals, plan, reference**

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/goals` | `{zone_id, target_c, by_date, team_id?}` |
| GET | `/goals/mine`, `/goals/{id}` | `{id, zone_id, zone_name, zone_centroid, target_c, by_date, kind:'action'|'cooling', progress_pct, modeled_c, team_id, org_id}` |
| PATCH/DELETE | `/goals/{id}` | |
| GET/POST/PATCH | `/goals/{id}/tasks`, `/goals/{id}/tasks/{task_id}` | Tasks with owner and date |
| POST/GET | `/goal-drafts` | Guest drafts |
| GET | `/goals/{id}/feasibility` | `{feasible, needed, capacity, spots_available, achievable_c, recommended_target_c, notes}` |
| GET | `/goals/{id}/plan` | `{actions, species, steps, next_task, care_plan, meta}` |
| GET | `/budget?goal_id` | Lines, totals, water, care |
| GET | `/species?lat&lng&lang`, `/species/{id}` | |
| GET | `/nurseries?lat&lng&radius_m` | |
| GET | `/geo/reverse`, `/geo/search`, `/geo/ip` | |

**Actions and trees**

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/action-types` | |
| POST | `/actions` | Multipart: `action_type, quantity, lat, lng, accuracy_m, taken_at, capture_source, photo, goal_id?, team_id?, species_id?, nickname?, note?` → `{log, trees, milestones}` |
| GET | `/actions/mine`, `/actions/{id}` | `status`, `checks[]`, `reason_code` |
| POST | `/actions/{id}/review` | `{approve}`. Reviewer ≠ owner |
| GET/POST | `/trees/mine`, `/trees` | |
| GET/PATCH/DELETE | `/trees/{id}` | Timeline included |
| POST | `/trees/{id}/checks` | Multipart: photo, `health`, `height_cm?`, `note?`. Next due +15 days |
| POST | `/trees/{id}/invite` | Invite a friend to water it |

**Community**

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/teams`, `/teams/{id}` | Stats from the ledger |
| POST | `/teams/{id}/join`, `/teams/join-by-code` | Limit 5 |
| DELETE | `/teams/{id}/members/me` | |
| GET | `/teams/{id}/invite` | `{code, url}` |
| GET/POST | `/teams/{id}/messages?since` | Chat |
| GET/POST | `/orgs`, `/orgs/{id}` | |
| GET | `/leaderboard?subject=user\|team\|org&scope=area\|city\|country&period=week\|month\|all&lat&lng` | |
| POST/DELETE | `/follows` | `{user_id\|team_id}` |
| GET/POST | `/feed?filter=area\|city\|following`, `/posts`, `/posts/{id}` | |
| POST/DELETE | `/posts/{id}/like` | |
| GET/POST | `/posts/{id}/comments` | @mentions |
| POST | `/reports`, `/blocks` | |
| GET/POST | `/moderation/queue`, `/moderation/{id}` | Moderators |
| GET/POST | `/events`, `/events/{id}` | |
| POST | `/events/{id}/rsvp`, `/events/{id}/checkin` | |
| GET/POST | `/notifications`, `/notifications/read` | |
| GET/POST/DELETE | `/push/config`, `/push/subscribe` | |

**Air and farmer**

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/air?lat&lng` | `{pm25, pm25_source, nasa_pm25, aqi, category, dominant, forecast, stations, my_sensors, advice, meta}` |
| GET/POST/DELETE | `/sensors/mine`, `/sensors`, `/sensors/{id}` | Token shown once |
| POST | `/sensors/ingest` | `X-Sensor-Token` |
| GET/POST/PATCH/DELETE | `/farm/fields` | |
| GET | `/farm/alerts?field_id` or `?lat&lng&crop&stage` | |
| GET/POST | `/farm/alerts/{id}`, `/farm/alerts/{id}/done` | |

**Store and company**

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/store/partners`, `/store/products?filter`, `/store/products/{id}` | |
| POST | `/store/products/{id}/redeem` | `{delivery_address?}`. Transactional |
| GET | `/orders/mine` | |
| GET/POST | `/saplings/products`, `/saplings/orders` | Paid |
| Partner | `/partner/products`, `/partner/redemptions`, `/partner/vouchers/{code}/collect`, `/partner/report` | |
| POST | `/company/register` | Multipart documents |
| GET/PATCH | `/company/me`, `/company/emissions` | |
| GET | `/company/overview`, `/company/packages`, `/company/certificates`, `/company/invoices` | |
| POST | `/company/orders` | Returns a payment URL |
| POST | `/payments/sslcommerz/{success,fail,cancel,ipn}` | Server-validated, idempotent |
| Admin | `/admin/companies/{id}/approve`, `/admin/credit-lots/{id}/certify`, `/admin/orders/{id}/confirm-transfer` | |

**Ask.** `POST /ask` `{message?, intent?, screen, context?:{zone_id?,tree_id?,field_id?,lat?,lng?}, lang}` → SSE. `POST /ask/{id}/feedback {helpful}`.

**Meta.** `GET /health` → `{db, data_mode, providers:{name:'ok'|'degraded'|'off'}, worker_last_run}`. `GET /sources` → every source with name, URL, status, latest data date, kind, licence and credit, plus the Heat Score formula and coefficients.

---

## 10. Failure behaviour

| Situation | API | UI |
| --- | --- | --- |
| Cold area, no cells yet | `status: partial`, `job_id` | Hex ring drawn, "Scanning satellite data…" progress, rows fill in |
| Planetary Computer down | Jobs retry with backoff. Serve existing cells. New areas: ORNL 1 km, else `estimate` if WorldCover is cached, else `no_data` | "Satellite data unavailable, showing <date>" or an honest error with retry |
| Some hexes cloudy | Widen to 365 days, then label `estimate` or `no_data` | Distinct hex style; count shown |
| Earthdata missing or 401 | Those providers report `off`; fallback chain | Sources list what was used; `/health` shows `off` |
| GEOS-FP or GEOS-CF slow or 504 | Job retries; last good kept | Open-Meteo values with their source |
| Open-Meteo down | Stale up to 24 h, then GEOS-FP | "Updated <time>" stale chip |
| POWER down | Stored normals; `null` if none | "Normal unavailable"; the rest renders |
| Overpass down | Enrichment job retries later; never blocks | Names via Nominatim; "Spots still loading" with retry |
| Nominatim down | Stored label, else coordinates | Coordinates |
| 429 from anyone | Honour `Retry-After`; back off; circuit breaker marks `degraded` | Nothing breaks |
| Our rate limit | `429 {code, retry_after}` | Limit reached message |
| Guest blocked | `403 auth.guest_restricted` | Account sheet |
| Bad zone id | `404 zone.not_found` | "This zone isn't on the map any more → Open the map" |
| Offline | SW serves shell and last GET | Offline indicator; cached chips |
| Payment failure | Order stays unpaid; validated server-side | Clear retry |
| Worker stopped | `/health` shows age | Data ages visibly, never fabricated |

Every screen shows loading, error with retry, empty, stale and guest-restricted states. Outbound calls have a timeout (4 s in a request, longer in jobs), retry with backoff (tenacity) and a per-provider circuit breaker.

---

## 11. Security, reliability and performance

**Security.**

- All keys only in `apps/api`. No backend secret in any `NEXT_PUBLIC_*`, bundle or log. Test by searching `.next/static`.
- Cookies as in A2. Same-origin plus `SameSite=Lax`; state-changing JSON requires `Content-Type: application/json`.
- Validate all input with Pydantic. Whitelist upload types, re-encode images, cap sizes. Sanitize user text in rendering (React escapes; never inject raw HTML).
- Authorization in services: a team lead cannot edit another team; company data is scoped to its members; private documents and pending photos go through authenticated routes, not public `/media`.
- Rate limits via `usage_counters`. Audit log for moderation, point revocation, admin actions and payments.
- Payments: never trust the browser. No card data is stored. Validate amount and status server-to-server.
- Privacy: precise tree and home locations are not public. Phone numbers are never public. Add a data export and delete-account path in Settings.

**Reliability.**

- Idempotent worker jobs and webhooks. Points, redemptions and credit lots run in transactions with constraints. Structured JSON logs with request IDs.
- Alembic migrations only. A `Dockerfile` (non-root, multi-stage) and `docker-compose.prod.yml` + `docs/deploy.md` for later use: **prepare them, do not deploy.**

**Performance targets.**

- Warm `GET /zones` p95 under 300 ms server time; zone screens under 2 s on a phone.
- Ask under 2 s. Cold partial response under 2 s.
- Lazy-load MapLibre as now. Keep Home CLS ≤ 0.1. Lighthouse mobile ≥ 90 for accessibility and SEO on the landing page; measure and report performance.

**Accessibility.** ≥ 44 px targets, labels on icon buttons, visible focus, `prefers-reduced-motion`.

**Attribution** on `/sources` and About: NASA datasets by name; "GEOS data provided by NASA's Global Modeling and Assimilation Office (GMAO)"; USGS for Landsat; © OpenStreetMap contributors (ODbL); ESA WorldCover (CC BY 4.0); Open-Meteo (CC BY 4.0); OpenAQ; DB-IP; Unsplash photographers; Lemon/Milk is donationware, so flag it for commercial use.

---

## 12. Execution stages

Do them in order. Commit at the end of each stage (more often is fine) with conventional messages on branch `v1`. Do not move on while a stage's exit check fails, unless the failure is a recorded external blocker.

### Stage 0: Preflight

1. `git status`. Create branch `v1` from the current `HEAD`. Leave unrelated untracked files alone.
2. Extend the root `.gitignore` (§8.5). **Replace the values in `apps/web/.env.example` with placeholders without printing them.** Move any old `.env` aside as §8.5 says, `cp .env.example .env`, and generate `JWT_SECRET` into it without printing it. Leave third-party values empty unless a person has filled them.
3. Docker: `docker info`. If the daemon is down (it was on 4 Nov), try `open -a Docker` and wait up to 2 minutes. If no Postgres + PostGIS can be started, finish the non-database work you can and report it first: **this is the only blocker with no workaround.**
4. `cd apps/web && npm ci`. Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run i18n:check`, `npm run build`. Expected baseline: 116 tests pass, all clean.
5. Check tools: `uv`, Python ≥ 3.12, `make`.
6. Create `docs/v1/`.

**Exit:** baseline recorded in `docs/v1/decisions.md`.

### Stage 1: Repository understanding

Read in this order: this file; `AGENTS.md`; `apps/web/src/lib/data/types.ts`; `lib/data/hooks/*`; `lib/data/local/*`; `server/**`; `components/map/*`, `plan/goal-wizard.tsx`, `zone/*`, `home/*`, `community/*`, `profile/*`, `act/*`, `ask/*`; `lib/location.tsx`; `lib/routes.ts`; `components/cz/shell/*`; `public/sw.js`; `src/proxy.ts`; `next.config.ts`; `docs/handoff/*`; `prompt-v0.md` §4–§5; `DEV-CHECKLIST.md`; and the relevant Next docs. Re-run the checks in §5 that could have changed: Planetary Computer collections, GEOS-CF v2 path, POWER. If reality differs from this prompt, trust reality, adapt, and record it.

**Exit:** `docs/v1/decisions.md` lists any differences found.

### Stage 2: Implementation planning

Write `docs/v1/plan.md` (short): each V0 module → V1 home, using §8.3; contract changes against `types.ts`; final table list; the order you will do §6 in. **Do not stop here.**

**Exit:** plan exists; continue immediately.

### Stage 3: Core infrastructure

1. `apps/api` scaffold per §8.1 and §8.3. `docker-compose.yml` (PostGIS 16, volume, healthcheck, bound to 127.0.0.1). `Makefile`. `make env`.
2. Config with startup validation. Error envelope. JSON logs. `/health`, `/sources`. HTTP client with timeouts, retry and circuit breaker. Rate limiter. `jobs` queue and worker skeleton.
3. Alembic baseline with all tables in §8.6 you can define now.
4. Auth (§6.2): register, login, guest, upgrade, OTP, Google, demo. Tests.
5. Next rewrites. `make gen-client`. Swap `useSession`, `useAuth`, `useProfile` and prefs to the API. Test sign-in end to end in the browser through the rewrite.

**Exit:** `make db migrate api web` runs; `/docs` lists the routes; register, login, guest and upgrade work through the Next origin; tests pass.

### Stage 4: NASA data integration

Build every provider in §5.2 and the engines in §7.

1. **First:** `app/scripts/verify_sources.py` and `make verify-sources`. For each source it makes one real request and prints source, status, latency, latest data date, sample value with units, and a pass/fail against an expected range. Write the output to `docs/v1/source-check.md`. Run it now and at the end. Without a token, Earthdata sources report `skipped: no credential`, not pass.
2. Heat pipeline (§7.1), Heat Score (§7.2), then calibrate on real Dhaka output. `app/scripts/scan.py --lat --lng --radius` prints ranked zones.
3. Run the Dhaka precompute for real and check the §7.2 acceptance numbers. Cross-check at least 5 zones against the GIBS layer, WorldCover and common sense: hot = dense roofs and roads; cool = parks and water.
4. POWER normals, recent. GEOS-FP and GEOS-CF v2 jobs. Conditions and air services. History. CMIP6. ECOSTRESS, IMERG, SMAP, LIS/OTD with credential gating, each tested with a recorded or synthetic fixture and verified live if a token exists.
5. Tests never hit the network: small synthetic COGs built with `rasterio` in the test, and respx fixtures. Test every conversion: DN → °C; fill handling; −999; `1.0E15`; °C ↔ K; `lat,lng` order; UTC to local-day aggregation; POWER normal vs the verified Dhaka values.

**Exit:** `verify-sources` passes for all keyless sources; Dhaka `heat_cells` is populated with `label = satellite`; `/conditions`, `/air` and `/zones` return real data with honest `meta`.

### Stage 5: Feature implementation

Follow the audit's dependency order: *the store can't launch before points are real, and points can't be real before accounts are.*

- **5A Fix the loop and the real map:** E2, E3, E7, E8, E10, E11, E12; §6.4; §6.5; §7.3–§7.7. Replace `useZones`, `useZone`, projection and spots. Contract test for E2.
- **5B Plan and goals:** §6.6, §7.10; E4, E9, P2; replace `POST /plan`, drafts, tasks, My goals. Deterministic plan text.
- **5C Act:** §7.11, §7.12; `POST /actions`, reviews; contribution page; remove AI verification UI; device import (A9).
- **5D My trees, badges, points:** §6.7, P1, ledger, worker jobs, E13.
- **5E Air, farmer, nurseries:** §7.8, §7.9, E15; remove curated nurseries.
- **5F Ask Atmos:** §6.12.
- **5G Community:** §6.8, P3, P4, E5, E16. Remove the seed; build demo mode.
- **5H Store:** §6.9. Buy saplings first, then the points store.
- **5I Company marketplace:** §6.10, §6.11. SSLCommerz in sandbox if credentials exist; otherwise test against mocked gateway responses, and report that real sandbox checkout was not run.

**Exit per step:** hooks are real, the screen works in the browser, tests pass, no seed or local data is behind it.

### Stage 6: Frontend and experience

- Navigation N1–N3, P5–P7, L1–L7. Avatar menu.
- Every new and changed screen: loading, error, empty, stale, guest; dark mode; RTL; 360 and 1280 px.
- Source chips with kinds; acquisition dates on every satellite number.
- E17, E18, W1, W2; E6 and E14 copy. Rewrite About from `/sources`.
- All 10 locales for every new string; `npm run i18n:check`. Check `ar` and `ur` for RTL breakage and `hi` and `zh` for font fallback.

**Exit:** a manual sweep via Playwright screenshots at both sizes in `en`, `bn`, `ur`, light and dark, with issues fixed.

### Stage 7: Integration and reliability

1. Remove everything in §8.4's delete list. Remove OpenAI per §3.2.
2. These must all return nothing outside docs and history: `rg -il 'openai|gpt-[0-9]|earthengine' apps`, `rg -l 'synthetic|snapshots/dhaka' apps/web/src`, and a search for the E5 names in seeds and messages.
3. Update `README.md`, `AGENTS.md`, `DEV-CHECKLIST.md`, `apps/api/README.md`, `apps/web/README.md`.
4. End-to-end flows through the Next origin with the worker running.
5. Check that `.env.example` and the code agree: every `settings` field and `process.env` read is in the file, and every file entry is read.
6. Prepare deployment files only.

**Exit:** `make dev` runs web, API and worker on a clean database; the demo script (§13.3) works.

### Stage 8: Testing and verification

Add what is missing, then run all of it and fix failures.

- **Backend (pytest):** every engine; every provider's parsing; auth, guest and rate limits; the E2 contract test; verification checks; ledger, pending to spendable, no overdraw, no double sell; team limit; leaderboard calendar reset; payment validation with mocked gateway, idempotent IPN; moderation fail-closed; payments create no points (M21).
- **Frontend (vitest):** keep or port existing tests that still apply.
- **E2E (Playwright, `make e2e`, with the worker and a test database):** the demo script; guest restrictions; goal draft through sign-up; upgrade keeps data; zone list matches detail; RTL and dark snapshots; 360 and 1280 px; offline shell; console errors and 404s fail the test.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run i18n:check`; `uv run ruff check`, `uv run pytest`; `make verify-sources`.

### Stage 9: Final audit

1. Write `docs/v1/audit-coverage.md`: every ID in §6 (E, A, N, P, L, H, Z, G, T, B, PT, C, S, M, R, K, W), status `done` or `blocked`, with the test or evidence for each. Be honest.
2. Re-run `make verify-sources`; update `docs/v1/source-check.md`.
3. Confirm no essential feature remains mocked or disconnected. Confirm `.env.example` matches. Confirm no secrets in the tree or the bundle.
4. Write `docs/handoff/v1.md` and the final report (§15).

---

## 13. Acceptance criteria

### 13.1 Must be true

1. `make dev` on a clean checkout with only `.env.example` copied starts everything, and the core heat loop works with **no third-party keys**.
2. `/zones` for Dhaka returns `label: satellite` hexes with real acquisition dates in under 2 s, and `meta.sources` names Landsat.
3. For every zone in a scan, list and detail are identical in `id`, `name`, `score`, `dist_m` and `h3`.
4. Hottest hexes are mostly built-up, coolest are vegetated or water, and §7.2's acceptance numbers hold on real data.
5. A 200 m scan shows "19 hexes · 200 m" as a gap-free hex outline.
6. Conditions show a real normal: about 29 °C on 4 Nov at Dhaka and about 36 °C in mid-April, not 40+.
7. GEOS-FP and GEOS-CF v2 values reach the UI when their jobs have run, with sources named.
8. Two browsers on different devices share the same account, team and leaderboard. Team points equal the sum of member points.
9. A verified tree creates pending points; they become spendable only after a 90-day check-in (test with a simulated clock); a redemption can't overdraw.
10. No reachable screen shows seed data outside demo mode, or names a real organization.
11. All 7 parent routes work; all unlinked pages are linked.
12. No `openai` package, no `OPENAI_*`, no "AI" UI string, no LLM call anywhere in `apps/`.
13. `next build`, lint, typecheck, vitest, pytest, ruff, `i18n:check` and Playwright pass.
14. `.next/static` contains no backend secret names or values.
15. Carbon credit sale is impossible without an admin certification record; every CO₂ figure is labelled an estimate and not an offset.
16. Every number on a data screen shows its source and kind; `/sources` lists actual status.

### 13.2 Credential-dependent

Without credentials these must degrade honestly and be listed as "built, not verified live":
ECOSTRESS sharpening, IMERG, SMAP, LIS/OTD, GPW; OpenAQ; Google sign-in against real Google; Twilio; SSLCommerz sandbox; Vision moderation; web push delivery.

### 13.3 Demo script (run it in Playwright; also the pitch video)

1. Install the PWA.
2. Onboard in বাংলা. Location asked first.
3. Home shows Dhaka live.
4. Map: a 200 m hex scan, then 500 m; hottest zone shown with Landsat dates.
5. Open the zone: same name, score and distance. See drivers with °C shares.
6. Set a goal: an action goal for 2 years; feasibility; plan with cost.
7. Planting spots and the "act vs don't act" projection.
8. Log a tree with the camera: checks shown, verified, pending points.
9. My trees: the tree, its state, next check-in.
10. Community: feed post, team leaderboard.
11. Store: pending vs spendable.
12. Air quality with source.
13. Farmer mode: Boro heat alert.
14. Ask Atmos "আমার এলাকা এত গরম কেন?": a Bangla answer with real numbers and source chips, under 2 s.
15. Switch to اردو: RTL.

### 13.4 Human sign-off checklist (for the team, after your run)

PWA install on Android and iPhone. Real camera and GPS on both. Temperature within 1–2 °C of a trusted weather app. Hot zones match visibly hot areas. Team join from a second phone by link, QR and code; a 6th member refused. Sensor curl ingest. Landing page Lighthouse.

---

## 14. Human-only tasks and open items

**Do not block on these; list them in your report.**

1. **Rotate the Google OAuth client secret.** It is public on GitHub. Scrubbing the file does not remove it from history.
2. Create an Earthdata Login and approve NASA GESDISC DATA ARCHIVE, LP DAAC and NSIDC. Set `EARTHDATA_*`.
3. Provide optional keys: OpenAQ, Google OAuth client, Twilio or another SMS gateway, SSLCommerz sandbox store, Vision API.
4. Choose an SMS gateway for Bangladesh. **Assumption:** Twilio Verify is the default adapter only because its API is well documented; a local gateway may be cheaper.
5. Subscribe to Open-Meteo before commercial launch.
6. Replace `OSM_USER_AGENT` with a real team contact.
7. Sign a pilot partner and pilot nursery; until then those tabs are empty in production. Add real prices (`cost_tables`).
8. A lawyer checks Bangladesh's rules before any carbon credit sale. Registering under Verra or Gold Standard is a business decision.
9. Native speakers review machine translations.
10. Decide on deployment. Lemon/Milk needs a donation or a replacement before commercial use.
11. Confirm the moderation choice: Google Vision is a design choice, and a local classifier could replace it.

**Assumptions to verify before anything irreversible:**

- Non-tree points unlock rule (PT9); points and prices are proposed values.
- Team size stays 2–5 although orgs have many teams.
- Tree state thresholds (T3) and the verification thresholds (§7.11) are starting values.
- GPWv4 access; `PM10_RH35` behaviour; OpenAQ coordinate order; SSLCommerz sandbox host.
- Tiered Planetary Computer limits: if anonymous access hits 429s in nightly jobs, back off and reduce concurrency; report it.
- Whether GEOS-FP's announced changes affect the endpoints.

---

## 15. Final report

Write it in `docs/handoff/v1.md` and repeat it as your last message:

1. What now works, end to end, with commands to run it.
2. `make verify-sources` output: each source, status, latest date.
3. Test results: real counts and failures.
4. Coverage summary from `docs/v1/audit-coverage.md`, with every `blocked` item and its reason.
5. What was built but not verified live, and why.
6. Credentials and human tasks still needed.
7. Decisions you made and assumptions that remain.
8. Anything in this prompt that turned out to be wrong.

Do not claim anything you did not run.
