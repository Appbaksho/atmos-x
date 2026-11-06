# Atmos X V1 audit

4 Nov 2026. Supports `prompt-v1.md` (the master implementation prompt) and `.env.example`. No application code was changed, and V1 is not built yet.

## Summary

- **V0 is healthy as software and weak as a NASA product.** In a clean copy, 116 tests pass, and typecheck, lint, `i18n:check` and `next build` are all clean. But NASA data is almost absent: one rainfall input and an optional map overlay.
- **OpenAI is less central than expected.** The heat score never used it. It writes explanations, fills plan details, checks photos and powers Ask Atmos, and all of that has a deterministic replacement. The real data gap is that heat comes from OpenStreetMap, not satellites.
- **The core V1 idea works with no NASA account.** A test read real Landsat surface temperature into H3 hexes across all of Dhaka in about 30 s. The hottest hexes were built-up and the coolest had trees.
- **The previous V1 prompt had factual errors** that would have produced wrong numbers on screen, including the "normal" temperature and a dead air-quality endpoint. All are corrected (§3).
- **One action can't wait:** a real-looking Google OAuth client secret is committed in `apps/web/.env.example` and is on `origin/main` and `origin/v0`. Rotate it. Scrubbing the file later does not remove it from git history.

## 1. V0 architecture and findings

**Stack.** `apps/web` only: Next.js 16.3.8, React 19, next-intl, TanStack Query, MapLibre, h3-js. `apps/api` is an empty README. There is no database, Docker Compose, Makefile or Playwright. The live site runs behind nginx on a VPS.

| Area | What actually happens |
| --- | --- |
| Conditions, forecast, normals, history | Open-Meteo and its ERA5 archive. Not NASA |
| Air quality | Open-Meteo CAMS model; AQI computed correctly by us |
| Heat zones, Heat Score | Deterministic estimate from Overpass land cover plus air temperature. Not satellite, not AI |
| NASA use | POWER 30-day rain in one drought rule; a monthly GIBS raster overlay |
| OpenAI use | `why_text`, plan details including unit costs, species outside Bangladesh, photo verification, tree health, Ask Atmos, the translate script |
| Accounts, goals, trees, teams, photos | IndexedDB on one device |
| Community, leaderboards, orgs | Static seed JSON that names real organizations |
| Sensors | Simulated (area PM2.5 ±8 %) |
| Fallbacks | Committed 4 Oct Dhaka snapshots and a synthetic heat field |
| Landing page | Still a placeholder |

**Worth keeping:** UI kit and design system, all screens, 10 languages and RTL, in-app camera, PWA, the hook layer (built to swap to a real API), farmer rules, AQI, BMD and heat-index logic, cooling maths.

## 2. Major V0 shortcomings

**Zone names and scores change between screens (audit errors 2 and 10).** Reproduced on the live API: the list said `Road 5 · 93`, and the detail for the same id said `Road 6 · 87`. Three of the four zones in that scan did not match. Three design faults combine:

1. When Overpass fails, the list silently comes from the 4 Oct snapshot, after waiting out a 25 s deadline. That also explains the 25-second scans (error 3). Both live scans took 25.2–25.3 s.
2. `scanForZone` re-derives the zone from whichever scan a global, last-writer-wins cache entry points to, then falls back to "a zone containing this cell", then "the nearest zone".
3. Zone IDs reference nothing stored, and a cell's score depends on the median of whichever scan it is in.

V1 stores each scan's zones as immutable rows and scores each hex independently of any scan, so this cannot recur.

**Other confirmed causes.**

- Guest "Check feasibility" does nothing (error 4): `goal-wizard.tsx` returns silently while `zone.data` is still loading.
- "Mohammadpur" vs "Lalmatia" (error 12): `DEMO_PLACE` is hard-coded while Nominatim says Lalmatia.
- Roof area larger than the zone (error 8): `plan/spots.ts` counts whole buildings by centroid.
- NASA LST tab looks empty (error 11): it is a monthly 1 km Level 6 raster.
- All 7 parent routes return 404 on the live site.

**Found by this audit, not in `audit.md`.**

- Three "curated" Dhaka nurseries have invented coordinates (the code says the prototype only had distances).
- `DU Green Society` is also built on a real university's name.
- A person can confirm their own pending action, because the "teammate" button has no second person behind it.
- Overpass was fully down during testing: 502, 504 and a timeout on the three mirrors.

## 3. Assessment of the previous V1 prompt

**Kept:** product brief, FastAPI + Postgres plan, API contract as the base, guest model, rate limits, EPA AQI, farmer rules, source attribution, human test checklist, demo script.

**Structural problems fixed.** It was a set of more than 20 prompts for parallel agents, written as if starting from Expo, with a large "current state" section that no longer applied. It is now one sequential prompt.

**Factual errors found by testing live services.**

| Previous prompt | Tested reality | Effect if left in |
| --- | --- | --- |
| Normal = POWER climatology `T2M_MAX` | That is the period's hourly maximum (April 42.5 °C). Even `T2M_MAX_AVG` (39.3 °C) is an average of monthly extremes. The mean daily maximum is 36.1 °C | Dhaka 3–6 °C "below normal" all year |
| Earth Engine as primary | Unpaid commercial use is prohibited; the product sells trees and packages | Terms violation at launch; needs human approval to start |
| `ST_B10` on Planetary Computer | Asset is `lwir11` | Pipeline fails |
| GEOS-CF v1 | OPeNDAP listing stops at 9 Dec 2024; v2 is live with `pm25_rh35` | Dead air-quality source |
| SMAP v007 | Deprecated; v008 is current | Stale data |
| `CIESIN/GPWv4_11/...` | Wrong ID | Fails |
| Projection = MODIS trend + CMIP6 delta | Counts warming twice | Inflated future heat |
| Score anomaly mapped −3…+8 °C | Real Dhaka anomalies: P5 −4.0, P95 +3.3 | Dense blocks score about 57, parks about 12 |
| `DATA_MODE=auto` falls back to fixtures | Serves fake data as real | Breaks the integrity requirement |
| H3 res 11 for scans ≤ 300 m | Finer than Landsat's native 100 m thermal band; `audit.md` also says res 10 | False precision |
| ORNL MODIS as a main fallback | Latest composite was 22 Sep; limited to 10 composites per request | Weeks-old data presented as current |

## 4. Requirements from `audit.md`

The file is `docs/Atmos X App Audit and Build Plan.md`; no file is literally named `audit.md`. It is untracked and was left where it is. Every actionable item has an ID in `prompt-v1.md` §6, and the implementing session must report each as `done` or `blocked`.

| Section | Prompt IDs |
| --- | --- |
| 18 flow errors | E1–E18 |
| Missing and unlinked pages, sidebar | P1–P7, L1–L7, N1–N3 |
| Hexagon scan, real location | H1–H5, L8–L11 |
| Real zones and goals | Z1–Z4, G1–G5 |
| Community and profile photos | C1–C14 |
| My trees, badges, points | T1–T6, B1–B8, PT1–PT11 |
| Points store, partner portal | S1–S17 |
| Company marketplace, credit ledger | M1–M23 |
| Profit, costs, retention | R1–R16 |
| Build order | Stage 5 sequence |

**Conflicts, and how they were resolved.**

| Conflict | Resolution |
| --- | --- |
| `audit.md` assumes AI text, an "AI location check" and a small model for photos; the brief says no OpenAI dependency | The brief wins. Deterministic text and checks plus human review meet the same goals |
| `audit.md` says Phone OTP and Google; previous prompt says email | All three. Email already exists and costs nothing to keep |
| `audit.md`: score from Landsat, OSM as explanation; Overpass is unreliable | WorldCover is the base explanation layer, and OSM adds detail when it answers |
| `audit.md` cool roof 30 points per 100 m²; V0 per 10 m² | `audit.md` wins |
| `audit.md` teams need roles lead and member; V0 has owner, admin, member | `audit.md` wins |
| Previous prompt allows fixture fallback; brief forbids simulated data shown as real | Fixtures only in tests and offline development |

**Explicitly deferred, with reasons in the prompt (§6.11).** Planting service, Adopt a tree and Cool-roof leads need operations or partners that do not exist. Paid org plans and report subscriptions defer billing only; the features are built. Selling certified carbon credits stays blocked until trees are certified, as `audit.md` itself requires.

## 5. NASA data integration findings

Tested live on 4 Nov 2026. "Keyless" sources returned real data. Earthdata-protected sources were confirmed in NASA's CMR catalog, but no file was read because no token was available.

| Source | Result |
| --- | --- |
| Landsat 8/9 on Planetary Computer | **End-to-end pass, no account.** 217 hexes over 1 km from 6 scenes in 25 s. Latest scene 2 Nov |
| ESA WorldCover (not NASA) | **End-to-end pass.** 2021 snapshot |
| HLS on Planetary Computer | **End-to-end pass, no account.** NDVI median 0.24, P95 0.61 at Mohammadpur (25 Oct). Latest 2 Nov |
| MODIS LST on Planetary Computer | **End-to-end pass, no account**, back to 2004. 8 of the 10 latest daily values at Dhaka were cloud-filled, so 8-day composites are used (latest 16 Oct) |
| NASA POWER | **Pass.** About 3 days behind; fill −999. 25-year daily series in about 2 s |
| GEOS-FP | **Pass, slow.** 27–53 s for 72 steps; 120 steps once gave 504. Worker only |
| GEOS-CF v2 | **Pass.** 15 s for a subset; 41.7 µg/m³ at Dhaka vs CAMS 52.3. `PM10_RH35` equalled PM2.5, which needs explaining |
| NEX-GDDP-CMIP6 (NCCS) | **Pass.** 12 s per model-year query |
| ORNL MODIS | **Pass, stale.** About 6 weeks behind |
| GIBS | **Pass.** Max zoom 7, gaps return 404 |
| ECOSTRESS, IMERG Early, SMAP v008, LIS/OTD | Catalog confirmed, fresh. **Reads need Earthdata** |
| GPWv4 (SEDAC) | Catalog confirmed; SEDAC site timed out. **Unresolved** |
| USGS LandsatLook direct files | Redirect to a login, so not usable anonymously |
| Planetary Computer tokens | Must use `/token/<account>/<container>`; the collection-name route returned 403 on MODIS |

**Science check on real data.** Dhaka city, March–May 2026, 4 scenes, 24,160 hexes, 34 s total:

| Land cover | LST anomaly vs city median (32.2 °C) | Hexes |
| --- | --- | --- |
| Built ≥ 90 % | +1.2 °C | 7,010 |
| Built 50–90 % | +0.5 °C | 4,038 |
| Grass or crop ≥ 50 % | −0.8 °C | 6,430 |
| Tree ≥ 50 % | −1.8 °C | 3,602 |
| Water ≥ 50 % | −3.4 °C | 844 |

Pearson r(LST, built) was +0.52 across the city. Over 1 km at Mohammadpur (Sep–Nov), r(LST, built) was +0.60 and r(LST, tree) −0.61. An anomaly mapping of −6…+6 °C gives built-up blocks a median of about 72, and tree and water hexes under 30. That is the prompt's starting calibration, to be re-checked on real output. Limits: the composite is a few scenes, Landsat passes at about 10:20 local, and WorldCover is from 2021.

**Weather sanity check.** On 4 Nov at Dhaka, GEOS-FP gave Tmax/Tmin 32.0/20.3 °C and Open-Meteo 30.5/24.4 °C. GEOS-FP's grid is coarse, so the prompt keeps it as the NASA forecast with a deterministic disagreement rule.

## 6. Architecture decisions

| Decision | Why | Rejected |
| --- | --- | --- |
| FastAPI + worker + Postgres/PostGIS | Already the repo's documented plan, and rasters and HDF5 need Python. A scan must be a database read | All-Next.js: no good raster or HDF5 tooling, and long jobs don't fit route handlers |
| Satellite data through Planetary Computer, no Earth Engine | Works today with no account or commercial restriction; the data is NASA and USGS | Earth Engine: terms, quota, human approval. LP DAAC only: needs a token for the core loop |
| Third parties only in worker jobs | Overpass and GEOS are slow or down; this is what caused the 25 s scans | On-demand fetching |
| Immutable scan rows, per-hex scores | Removes the cause of errors 2 and 10 | Patching names on the detail page |
| Hex res 10 everywhere | Matches the thermal band and `audit.md` | Res 11 at small radii |
| No LLM | Brief; also instant answers and no per-call cost | Optional LLM layer: not approved |
| Postgres `jobs` table | No new service | Redis, Celery |
| Append-only points ledger | Pending, spendable and auditable points; team totals add up | Stored counters |
| ECOSTRESS changes only the relative pattern | Passes happen at any hour, so absolute values don't compare to Landsat | Replacing Landsat values |
| Single-gateway payments | SSLCommerz's hosted page is meant to cover card and wallets (**to confirm**) | Separate bKash and Nagad integrations |

## 7. Environment decisions

- **One root `.env`.** `make env` copies only `API_ORIGIN`, `ATMOS_BUILD_ID` and `NEXT_PUBLIC_*` to the web app, so the Next server holds no backend secrets.
- **Removed:** `OPENAI_*`, `AI_DAILY_REQUEST_CAP`, the Open-Meteo, Nominatim and POWER URL overrides, `ATMOS_CACHE_DIR`, `ATMOS_LOG`, `GOOGLE_OAUTH_TOKEN_URL`. Tests mock upstreams instead.
- **Dropped from the old plan:** `GEE_*`, `OVERPASS_URL` (now the plural V0 form), `UPLOAD_DIR` (now `DATA_DIR`).
- **Added:** `APP_ENV`, `SMS_PROVIDER`, Twilio, SSLCommerz, moderation, `OPEN_METEO_API_KEY`, `VAPID_SUBJECT`.
- **NASA credential:** Earthdata Login only. POWER, GEOS, GIBS and ORNL are keyless, and no `api.nasa.gov` key is used.
- **Empty optional value = feature off**, stated honestly in the UI. No real values were copied; `.env` and `.env.local` were read for key names only.

## 8. Contradictions, assumptions and limitations

**Not verifiable in this task.**

- Earthdata file reads (no token): ECOSTRESS scale, IMERG dimension order, SMAP grid, LIS/OTD variables. Flagged **Check** in the prompt.
- OpenAQ coordinate order: docs show both. The real call needs a key.
- SSLCommerz sandbox host: sources show two. bKash and Nagad routing was not confirmed from documentation.
- Open-Meteo's paid host name came from a third-party source.
- Signed-in flows on the live site, because `audit.md`'s test was guest-only.
- 404 resource errors on the map (error 17): the cause was not identified without a browser run; the prompt requires a Playwright check.

**Assumptions the implementing session must record.**

- Non-tree points unlock after verification plus 90 days; `audit.md` defines the rule for trees only.
- Twilio Verify is the default SMS adapter only because it is well documented. A local Bangladesh gateway may be cheaper.
- Google Vision SafeSearch is the optional moderation provider, and without it every public photo waits for a moderator. It is a design choice you may want to change.
- Thresholds for tree states, verification, ECOSTRESS blending and score weights are starting values.
- Local commits on a `v1` branch are authorized by the prompt, for a run this long. Nothing is pushed or deployed.

**Limitations to keep in mind.**

- Landsat sees surfaces at about 10:20 local, not air temperature, and not peak afternoon heat.
- A res-10 hex holds about 1.5 native thermal pixels, so neighbouring hexes are not fully independent.
- Monsoon cloud can leave few clear scenes. The prompt widens to 365 days, then labels hexes `estimate`.
- The verification heuristics can be fooled. Human review, the 90-day rule and duplicate detection are the real defence.
- Planetary Computer has no service guarantee for anonymous use, and NCCS has announced coming GEOS-FP changes. `/health` and `make verify-sources` exist to catch this.
- The run is very large. Expect some items to end as `blocked`, and read the coverage report rather than assuming all is done.

**Human tasks** are listed in `prompt-v1.md` §14. First: rotate the Google secret. Docker was not running on this machine during the audit, and the implementing session needs it.

## Sources

Web lookups, beyond the live endpoint tests:

- [BMD bulletin bands (official PDF, 13 Apr 2026)](https://www.bamis.gov.bd/res/public/weather_table/pdf/2026-04-13.pdf)
- [Earth Engine noncommercial tiers](https://developers.google.com/earth-engine/guides/noncommercial_tiers), [transition to commercial](https://developers.google.com/earth-engine/guides/transition_to_commercial)
- [Open-Meteo terms](https://open-meteo.com/en/terms)
- [earthaccess authentication](https://earthaccess.readthedocs.io/en/stable/user/howto/authenticate/)
- [ECOSTRESS tiled data tutorial](https://nasa.github.io/ECOSTRESS-Data-Resources/python/tutorials/Working_with_ECOSTRESS_Tiled_data.html)
- [OpenAQ API docs](https://docs.openaq.org/api)
- [SSLCommerz sandbox docs](https://sandbox-gw.sslcommerz.com/docs)
- [Cloud Vision pricing](https://cloud.google.com/vision/pricing)
