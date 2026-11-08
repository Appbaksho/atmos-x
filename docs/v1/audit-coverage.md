# V1 requirement coverage (prompt-v1 §6)

Date: 2026-11-08 · Branch: `main` after PRs #12–#20 · Stage 9 final audit (re-checked after closing the gaps the first draft found).

## How to read this

- Every requirement ID in `prompt-v1.md` §6 appears exactly once (169 IDs, families E, A, N, P, L, H, Z, G, T, B, PT, C, S, M, R, K, W).
- **done**: the code exists and a named test or code path shows it working.
- **blocked**: not built, only partly built, deferred by the plan, or a human task. The reason says which. Anything only partly built is listed as blocked, with what works and what is missing.
- **Built, not verified live**: the item is done in code and tests (upstream mocked), but the live service could not be exercised in this run (missing credentials or approvals). These count as done and are listed at the end.
- Paths: pytest files are `apps/api/tests/…`, Playwright specs are `apps/web/e2e/…` (Chromium), API code is under `apps/api/app/`, web code under `apps/web/src/`. `Dn` refers to `docs/v1/decisions.md`.

**Totals:** 162 done (7 of them built, not verified live) · 7 blocked.

## E · Errors found in flows (§6.1)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| E1 | Device-only data moves to a server database with real sign-in | done | `test_auth.py::test_register_login_logout_me`, `::test_guest_then_upgrade_keeps_id_and_profile`; device data moved by A9 (`test_act.py::test_device_import_is_idempotent`); `models/identity.py` |
| E2 | One zone object: list and detail return identical id, name, score, dist_m, h3 | done | `test_zones.py::test_e2_list_and_detail_are_identical`; `e2e/heat.spec.ts` "map shows the hex ring count and the zone list matches the zone page (E2, H4)"; `e2e/demo.spec.ts` step 5 |
| E3 | No third-party call in any request path; warm scan < 2 s, cold partial < 2 s, Ask < 2 s | blocked | Partial. Timing targets met on the dev stack: warm scan 0.02 s, cold scan 0.18 s with partial results (`test_cold_area_returns_partial_and_queues_one_job`), cold `/conditions` 1.15 s, warm 0.02 s; Ask's Bangla answer under 2 s (`e2e/ask.spec.ts`). `/conditions` never calls the geocoder; a missing name is queued (`place_label` job, `test_conditions_never_calls_the_geocoder`). Still open: a forecast for a place nobody has opened yet is one bounded upstream call (1.5 s budget) in the request; `/geo/reverse` and `/geo/search` are geocoding endpoints by design |
| E4 | Check feasibility shows loading while the zone loads; guest gets sign-up sheet, draft kept | done | `components/plan/goal-wizard.tsx` (skeleton until `zone.data`, busy button, guest `saveGoalDraft` + `requireAccount`); `e2e/goal.spec.ts` "a guest gets the account sheet and the draft is kept (E4, G5)"; `test_plan_goals.py::test_guest_drafts_then_upgrades_and_creates_goal` |
| E5 | Invented names only; a test fails on real bodies | done | `test_community.py::test_e5_no_real_organizations_in_seeds_or_messages` (includes PRAN and DU Green Society); `e2e/community.spec.ts` "demo mode shows only the invented demo community (§8.4, E5)" |
| E6 | Landsat and ECOSTRESS in the Heat Score; About built from `/sources` | done | `services/heat_pipeline.py compute_area` (Landsat LST, ECOSTRESS 0.3 blend); `e2e/about.spec.ts` "About is built from /sources and has no AI or v0 copy (E6, E14, K9)"; `docs/v1/source-check.md` |
| E7 | Loading state on the tapped zone row in goal step 1 | done | `components/plan/goal-wizard.tsx` zone picker (`opening` state shows a `Spinner` on the tapped row). No automated test |
| E8 | Roofs clipped to the zone; roof + ground ≤ zone area | done | `test_cooling_spots.py::test_e8_roofs_clipped_and_invariant` |
| E9 | Recommend from real space and the timeline; under 3 years = action goal | done | `test_cooling_spots.py::test_e9_short_goal_with_no_ground_is_not_recommended`, `::test_recommend_uses_timeline` |
| E10 | Home, Map and goal read one scan | done | `components/map/use-scan.ts` (shared by Home, Map, onboarding); goal wizard calls `useZones` for the same point; the server returns the same scan id (`test_zones.py::test_e2_list_and_detail_are_identical`, "same request again") |
| E11 | GIBS daily MODIS below zoom 9, our Landsat hexes above, with dates | done | `components/map/map-view.tsx` (`GIBS_MAX_VIEW_ZOOM = 9`, dated URL from `GET /map/gibs`); `test_providers.py::test_gibs_default_date` |
| E12 | Reverse-geocode once per scan and reuse; delete `DEMO_PLACE` | done | `DEMO_PLACE` deleted; the place label is cached per cell (`place_labels`, `services/geo.py reverse`) and reused; the demo point is named by the same reverse geocode (`lib/location.tsx`); "Finding your place…" replaces the hard-coded label (`e2e/location.spec.ts`) |
| E13 | Team points computed from member ledger rows | done | `test_community.py::test_team_stats_and_pt6`, `::test_orgs_and_team_board` (D26) |
| E14 | Nurseries text changed in all 10 locales | done | `i18n/messages/*/profile.json` `about.sections.nurseries.body` (all 10 updated); `e2e/about.spec.ts` (asserts "Partner nurseries can sell saplings", no "never sells") |
| E15 | Real sensor ingest; simulation removed | done | `test_sensors.py::test_sensor_token_once_and_ingest`; `routers/sensors.py` `POST /sensors/ingest`; `lib/data/hooks/air.ts`. Only stale "simulated in v0" code comments remain in `components/air/*` |
| E16 | Leaderboard rows and people link to team, org and profile pages | done | `components/community/hub.tsx` leaderboard rows (`r.href` to user, S17, S18); `test_community.py::test_orgs_and_team_board` (row href); `e2e/community.spec.ts` (author opens `/app/u/…`) |
| E17 | No hydration error; Playwright fails on any console error or 404 | done | `e2e/fixtures.ts` (auto fixture fails every test on console error, page error or same-origin 404); `docs/v1/sweep-stage6.md` (0 problems in 120 shots); `docs/v1/links-signed-in.md` (0 errors in 90 pages) |
| E18 | Preload the welcome hero; chip above the headline | done | `components/onboarding/welcome.tsx` (`preload(…, fetchPriority: 'high')`); `docs/v1/sweep-stage6.md` (Welcome row) |

## A · Accounts and sign-in (§6.2)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| A1 | Postgres `users`, `auth_identities`, `profiles` | done | `models/identity.py`; `test_auth.py::test_register_login_logout_me` |
| A2 | `atmos_session` httpOnly, Lax, Secure off localhost; 30 d / 7 d; rotate; sliding refresh | done | `test_auth.py::test_session_cookie_flags` (30 d), `::test_guest_then_upgrade_keeps_id_and_profile` (guest 7 d); `security.py should_refresh` + `deps.py` (refresh under 50 %). Sliding refresh has no direct test |
| A3 | Phone OTP with limits; `SmsProvider` console and Twilio | done | `test_auth.py::test_otp_flow`, `::test_otp_attempt_limit`, `::test_otp_rate_limit_per_number`; `services/auth.py` (`ConsoleSms` refuses production, `TwilioVerifySms`); `components/auth/auth-screen.tsx`. Built, not verified live: Twilio credentials are empty |
| A4 | Google sign-in ported; client id from `/auth/google/config`; linking needs the password | done | `test_auth.py::test_google_sign_in_and_link`, `::test_google_rejects_bad_claims`, `::test_google_disabled`; `POST /auth/google/link` (D11). The live Google popup is not exercised in e2e |
| A5 | Email + password, argon2id, ≥ 8 characters, generic error | done | `security.py` (argon2id); `test_auth.py::test_short_password_and_bad_email`; `e2e/auth.spec.ts` "sign in with email and password" |
| A6 | Server guest; upgrade in place keeps data | done | `test_auth.py::test_guest_then_upgrade_keeps_id_and_profile`; `e2e/auth.spec.ts` "guest upgrades in place through the sign-up form" |
| A7 | Guest can/can't list; `403 auth.guest_restricted` opens the sheet | done | `test_act.py::test_guest_cannot_log`; `test_zones.py::test_guest_radius_cap`; `test_farm.py::test_guest_alerts_by_place_and_fields_need_an_account`; `e2e/farm.spec.ts` "guests preview alerts by place but cannot save fields (A7)"; `e2e/trees.spec.ts` "My trees and a tree link ask guests to create an account (A7)" |
| A8 | Ask 30/5 a day; cold scans 30/10 an hour; auth limits per IP | done | `test_ask.py::test_guest_limit_unknown_storage_and_feedback`; `services/scan.py COLD_LIMIT`; `routers/auth.py _ip_limit` (D10); `test_auth.py::test_otp_rate_limit_per_number`. The cold-scan limit has no test |
| A9 | One-time device import, idempotent; demo and simulated sensors never imported | done | `test_act.py::test_device_import_is_idempotent`; `lib/data/hooks/device-import.ts`, `components/home/import-offer.tsx` (D23) |
| A10 | Roles user, guest, moderator, admin + company/partner membership; `make_admin` | done | `models/identity.py` (role check), `models/store.py PartnerMember`, `models/company.py CompanyMember`; `scripts/make_admin.py`; role gates in `test_market.py::test_company_flow_trees_held_then_released_and_no_points` and `test_community.py::test_feed_likes_comments_mentions_follow_block_report_moderate` |

## N · Navigation (§6.3)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| N1 | Sidebar order, then Air quality, Notifications, Settings, About | done | `e2e/nav.spec.ts` "navigation: tabs, Log action, avatar menu and sidebar (N1–N3)"; `components/cz/shell/tab-bar.tsx` (`MORE` list) |
| N2 | Five phone tabs; Store and Profile in the avatar menu | done | `e2e/nav.spec.ts` (mobile project) |
| N3 | "+ Log action" in sidebar, bottom bar and every goal task | done | `e2e/nav.spec.ts`; `components/plan/plan-screen.tsx LogTask`; `components/plan/my-goals.tsx` |

## P · Parent routes (§6.3)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| P1 | `/app/tree` My trees | done | `e2e/trees.spec.ts` "log a planting, see it in My trees and check in"; `e2e/nav.spec.ts` |
| P2 | `/app/goal` My goals | done | `e2e/goal.spec.ts` "a user sets a goal from a zone and sees it in My goals (G1–G4, P2)" |
| P3 | `/app/team`: teams I'm in, invites, Discover | done | `components/community/directory.tsx MyTeamsPage`: my teams, an Invites section (join by code) and Discover (`e2e/gaps.spec.ts` "My teams has an invites section") |
| P4 | `/app/org` directory, linked from the Orgs leaderboard | done | `components/community/directory.tsx`; `hub.tsx` (`href('orgs')`); `docs/v1/links-signed-in.md` |
| P5 | `/app/species`; Plan's "Show all" opens it | done | `e2e/goal.spec.ts` "parent routes work (P2, P5, P6, P7)"; `components/plan/species-catalog.tsx` |
| P6 | `/app/farm` redirects to `/app/farm/fields` | done | `e2e/goal.spec.ts` "parent routes work"; `e2e/farm.spec.ts` |
| P7 | `/app/zone` redirects to `/app/map` | done | `e2e/goal.spec.ts` "parent routes work" |

## L · Links and location (§6.3, §6.4)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| L1 | `/app/log-action` linked from N3 | done | `e2e/nav.spec.ts` (Log action href) |
| L2 | `/app/nurseries` from Plan, species pages, Store | done | `components/plan/plan-screen.tsx`, `components/plan/species-detail.tsx`, `components/store/store.tsx` (all link S12) |
| L3 | `/app/budget` from Plan once a goal exists | done | `components/plan/plan-screen.tsx` (budget stat card and "See budget" link S13) |
| L4 | "Farm" sidebar item | done | `e2e/nav.spec.ts` (sidebar includes Farm) |
| L5 | `/app/org/[id]` from Orgs leaderboard rows | done | `hub.tsx` row href S18; `test_community.py::test_orgs_and_team_board` |
| L6 | `/app/team/[id]` from Teams leaderboard rows | done | `hub.tsx` row href S17 |
| L7 | Recheck links while signed in and log findings | done | `docs/v1/links-signed-in.md` (90 pages, 0 console errors, 0 failed requests) |
| L8 | Ask for location with one line why; if refused, IP city and search | done | Onboarding asks first with one line why; without a fix or when refused, the city from the IP (`/geo/ip`, local DB-IP) resolves the place, otherwise a gate offers search (`lib/location.tsx fromIp`, `components/cz/shell/location-gate.tsx`, `e2e/location.spec.ts`) |
| L9 | High accuracy, accuracy circle, re-scan after moving 100 m | done | `enableHighAccuracy: true`; a granted location is watched and a move over 100 m re-scans (`lib/location.tsx` `watchPosition`, `RESCAN_M`); the map draws the accuracy circle (`components/map/map-view.tsx accuracyShape`). No e2e moves the device |
| L10 | Reverse-geocode once per scan; reuse that name | done | Scan stores `place` (`services/scan.py`); every lookup shares the per-cell `place_labels` cache (30 days, `services/geo.py reverse`), so Home, Map and conditions name the same point the same way |
| L11 | Keep a labelled Dhaka demo; no silent Mohammadpur default (`focus` null until resolved) | done | "Try the Dhaka demo" stays labelled; no silent default: `resolved`/`needsPlace` in `lib/location.tsx`, and screens that need a place show the gate until one resolves (`e2e/location.spec.ts`) |

## H · Hexagon scan (§6.4)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| H1 | Scan area drawn as the hex ring outline; no dashed circle | done | `test_engines.py::test_ring_outline_is_closed_polygon`; scan `outline`; `components/map/map-view.tsx areaShape` |
| H2 | `k = ceil(r / 135)`: 19, 61, 217 hexes | done | `test_engines.py::test_k_for_radius_and_counts`; `test_zones.py::test_e2_list_and_detail_are_identical` (61), `::test_guest_radius_cap` (217), `::test_cold_area_returns_partial_and_queues_one_job` (19) |
| H3 | Presets 200 m, 500 m, 1 km; default 200 m; guests ≤ 500 m | done | `components/map/radius-control.tsx RADIUS_PRESETS`; D9; `test_auth.py::test_guest_then_upgrade_keeps_id_and_profile` (guest capped at 500) |
| H4 | "19 hexes · 200 m" from the scan | done | `e2e/heat.spec.ts`; `e2e/demo.spec.ts` (Bangla digits) |
| H5 | Every hex filled; distinct "no data" style | done | `test_zones.py::test_cold_area_returns_partial_and_queues_one_job` (19 `no_data` hexes); `components/map/map-view.tsx` (no-data opacity) |

## Z · Real zones and reasoning (§6.5)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| Z1 | One zone object end to end | done | `test_zones.py::test_e2_list_and_detail_are_identical`; `e2e/heat.spec.ts`; `e2e/demo.spec.ts` |
| Z2 | Satellite heat first (Landsat, ECOSTRESS, WorldCover base, OSM detail); label satellite or estimate | blocked | Partial. Works: Landsat LST hexes sharpened with ECOSTRESS where a pass exists, WorldCover as the base, labels `satellite`/`estimate` (`test_hot_zone_ranks_first_and_drivers`, `e2e/heat.spec.ts`, clean-database run in PR #17). Missing: OSM building and road detail on heat cells (Overpass answers again: 1/3 mirrors on 8 Nov) |
| Z3 | Precompute Dhaka nightly; scan is a database read | done | `jobs/__init__.py` (`heat_regions` at 21:30 UTC, `boot_regions`); `scripts/precompute.py`; `test_zones.py::test_job_progress_updates` |
| Z4 | Each driver shows value and °C share | done | `test_engines.py::test_driver_fit_recovers_coefficients`, `::test_contributions_causes_why_whatif`; `test_zones.py::test_hot_zone_ranks_first_and_drivers` (D16) |

## G · Goals (§6.6)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| G1 | Space from the zone polygon | done | `test_cooling_spots.py::test_e8_roofs_clipped_and_invariant`, `::test_coefficients_floor_area`; `services/spots.py`; `test_plan_goals.py::test_preview_without_spots_queues_job` |
| G2 | Target from space and timeline (`treeRamp`) | done | `test_cooling_spots.py::test_tree_ramp_points`, `::test_recommend_uses_timeline`; `test_plan_goals.py::test_preview_feasibility_uses_space_and_timeline` |
| G3 | Under 3 years = action goal | done | `test_cooling_spots.py::test_e9_short_goal_with_no_ground_is_not_recommended`; `goal-wizard.tsx` (`actionGoal`) |
| G4 | Goals saved on the server with tasks, owners, dates | done | `routers/plan.py` goals and tasks; `test_plan_goals.py::test_goal_privacy_and_idempotent_client_id`; `e2e/goal.spec.ts` "a user sets a goal…" |
| G5 | Guests draft; saving opens sign-up and keeps the draft | done | `e2e/goal.spec.ts` "a guest gets the account sheet and the draft is kept"; `test_plan_goals.py::test_guest_drafts_then_upgrades_and_creates_goal` |

## T · My trees (§6.7)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| T1 | Top strip: planted, alive, points, cooling | done | `components/profile/my-trees.tsx`; `e2e/trees.spec.ts` |
| T2 | Grid: photo, nickname, species, age, state badge | done | `components/profile/my-trees.tsx`; `e2e/trees.spec.ts` (tile "Corner neem 1, Verifying") |
| T3 | Server-derived states, unit-tested; thresholds in config | done | IMERG rain verified live on 8 Nov after the GES DISC approval (`trees.rain_7d` returns source `imerg`). `test_act_engines.py::test_tree_states_first_match_wins`; `engines/trees.py` (`CFG`, `state`). Built, not verified live: IMERG needs the GES DISC EULA approval (D20), so "needs water" uses NASA POWER rain, labelled |
| T4 | Map view of my tree pins | done | `components/profile/my-trees.tsx TreesMap`. No automated test |
| T5 | Tree detail: photo timeline, height and health, tips, next date, cooling, share as post, invite to water | done | `components/profile/tree.tsx`: photo timeline, height and health, tips, next date, the cooling estimate (labelled) and "Share as a post"; invite to water (`e2e/gaps.spec.ts`, `e2e/trees.spec.ts`) |
| T6 | Check-in: photo, health, optional height; deterministic checks and tips | done | `e2e/trees.spec.ts` "log a planting, see it in My trees and check in"; `test_act.py::test_ninety_day_check_in_unlocks_tree_points`; `test_act_engines.py::test_on_time_window_and_tips` |

## B · Badges (§6.7)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| B1 | First Seed | done | `data/catalog.py BADGES`; `test_act.py::test_verified_planting_earns_pending_points` |
| B2 | Grove (10 alive) | done | `test_act_engines.py::test_levels_and_badge_rules` |
| B3 | 3-Month Survivor | done | `test_act.py::test_ninety_day_check_in_unlocks_tree_points` |
| B4 | One-Year Guardian | done | `data/catalog.py` (`guardian_1y`); `services/badges.py` (`milestone_y1`); rule kind tested for 90 days in `test_levels_and_badge_rules`. No 1-year test |
| B5 | Monsoon Planter | done | `test_act_engines.py::test_levels_and_badge_rules` (planted months) |
| B6 | Roof Cooler (100 m²) | done | `data/catalog.py`; `services/badges.py` (verified cool-roof m²); `engines/progress.py badge_earned`. No test |
| B7 | Team Player | done | `test_community.py::test_team_stats_and_pt6` |
| B8 | Streak (6 on time) | done | `data/catalog.py`; `services/badges.py` (on-time streak); `engines/progress.py`. No test |

## PT · Points (§6.7)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| PT1 | 50 per verified tree | done | `test_act.py::test_verified_planting_earns_pending_points` |
| PT2 | 10 per on-time check-in | done | `test_act.py::test_ninety_day_check_in_unlocks_tree_points` (10; late check-in 0) |
| PT3 | 50 at 90 days | done | same test (spendable 110 = 50 + 10 + 50; D21) |
| PT4 | 200 at 1 year | done | `services/trees.py check_in` (PT4 at an on-schedule check-in at ≥ 365 days, D21). No direct test |
| PT5 | 30 per 100 m² cool roof | done | `data/catalog.py ACTION_TYPES` (30 per 10 units of 10 m²); `services/actions.py action_points`. No direct test |
| PT6 | 100 to each member when a team goal is reached | done | `test_community.py::test_team_stats_and_pt6` |
| PT7 | 25 when an invited friend plants | done | `test_act.py::test_invite_a_friend_to_water_and_pt7` (D22) |
| PT8 | Append-only `points_ledger`; server-computed balances | done | `test_act.py::test_spending_never_overdraws_and_ledger_is_append_only`; `services/points.py` |
| PT9 | Pending until the tree's 90-day check-in; non-tree after 90 days | done | `test_act.py::test_ninety_day_check_in_unlocks_tree_points`, `::test_non_tree_points_unlock_after_ninety_days`; assumption recorded (D21) |
| PT10 | Revoked trees revoke points; levels from earned; boards from verified | done | `test_act.py::test_deleting_a_tree_revokes_its_points`; `test_act_engines.py::test_levels_and_badge_rules` |
| PT11 | Worker unlocks points, awards milestones, sends due notifications | done | `jobs/daily.py` (`points_unlock`, `tree_reminders`, `badges_daily`); `test_act.py::test_daily_reminders_are_sent_once_per_due_date`; milestones at check-in (D21) |

## C · Community (§6.8)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| C1 | Upload, circle crop on a hand-written canvas, ~256 px | done | `components/profile/avatar-editor.tsx`; `test_act.py::test_avatar_upload_is_moderated` |
| C2 | Initials fallback | done | `Avatar` (`ini`) in `hub.tsx`, `team.tsx`, `feed.tsx`, `account-menu.tsx` |
| C3 | Photo on leaderboards, members, posts, comments, header | done | `Avatar src=avatar_url` in `community/hub.tsx`, `community/team.tsx`, `community/feed.tsx`, `cz/shell/account-menu.tsx`, `cz/shell/tab-bar.tsx` |
| C4 | Automatic nudity/violence check; report a photo | done | `test_stage8.py::test_vision_rejects_flagged_and_approves_clean`, `::test_vision_failure_keeps_the_photo_in_the_queue`, `::test_vision_bad_answer_keeps_the_photo_in_the_queue`, `::test_manual_moderation_never_calls_out`; `services/social.py REPORT_TARGETS` (photo). Built, not verified live: no Google Vision key, so moderation defaults to the manual queue |
| C5 | Accounts and public profile `/app/u/[id]` | done | `GET /users/{id}` (`services/social.py`); `e2e/community.spec.ts` (author opens profile) |
| C6 | Feed: photo, text, likes, comments, mentions; Area, City, Following | done | `test_community.py::test_feed_likes_comments_mentions_follow_block_report_moderate`; `e2e/community.spec.ts` "join by invite code, chat, post and like (C6, C8)" |
| C7 | Follow people and teams; Following feed | done | same pytest (following filter); `models/identity.py Follow` (user or team) |
| C8 | Teams: create, invite, roles, goal, chat (polling), activity | done | `test_community.py::test_teams_join_chat_leave`, `::test_team_stats_and_pt6`; `e2e/community.spec.ts`; chat polls every 7 s (`lib/data/hooks/community.ts`) |
| C9 | Organizations: page and leaderboard | done | `test_community.py::test_orgs_and_team_board`; `components/community/org.tsx` |
| C10 | Events: date, place, RSVP, GPS check-in ≤ 300 m, group photo, sponsor | done | `test_community.py::test_events_rsvp_checkin_and_reminders`; `services/events.py` (`CHECKIN_M = 300`, `set_group_photo`, `sponsor_name`) |
| C11 | Leaderboards by person, team, org; area, city, country; week, month, all | done | `test_community.py::test_leaderboards_area_month_me_and_demo_separation`; `test_stage8.py::test_week_starts_monday_midnight_in_dhaka`, `::test_month_starts_on_the_first_in_dhaka` |
| C12 | Notifications incl. V0's goal progress, heat warning, farm alert, verification | done | All kinds incl. heat warnings: `services/heat_alerts.py` + daily `heat_warnings` job (07:00 Dhaka), once per area per day, no guests (`test_heat_warnings_notify_each_home_area_once_a_day`); goal progress, farm alerts and verification as before |
| C13 | Report, block, moderator queue, hide, new-account limits | done | `test_community.py::test_feed_likes_comments_mentions_follow_block_report_moderate`, `::test_share_a_verified_action_and_new_account_limits` |
| C14 | Every verified action becomes a shareable post | done | "Share as a post" on verified actions (`components/act/contribution.tsx`) and trees, through `POST /posts` with `action_id` (refused for unverified actions, `test_share_a_verified_action_and_new_account_limits`; `e2e/gaps.spec.ts`) |

## S · Points store (§6.9)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| S1 | Header: spendable, pending, unlock date | done | `e2e/store.spec.ts` "demo: redeem a pilot product for a voucher QR, then see it in My orders (S1–S10)"; `e2e/demo.spec.ts` |
| S2 | Partner rows: logo, CSR line, products | done | `components/store/store.tsx`; `e2e/store.spec.ts` ("Green Basket (demo pilot)", "one pilot partner") |
| S3 | Product card: photo, name, price, stock, pickup or delivery | done | `components/store/store.tsx` product card |
| S4 | Filters: Can afford, Food, Home, Garden, Vouchers | done | `components/store/store.tsx FILTERS`; `e2e/store.spec.ts` (Can afford) |
| S5 | Buy saplings tab, taka, commission; empty state | done | `test_market.py::test_saplings_checkout_is_validated_and_idempotent`; `e2e/store.spec.ts` "guest: the store explains how to earn and saplings show the nursery state (S1, S5)". Built, not verified live: no SSLCommerz browser checkout |
| S6 | Product detail: partner, outlets or area, terms | done | `components/store/product.tsx`; `e2e/store.spec.ts` |
| S7 | Redeem and confirm points | done | `e2e/store.spec.ts` ("Spend 180 pts") |
| S8 | Voucher code and QR for 14 days, or delivery address | done | `e2e/store.spec.ts`; `test_market.py::test_delivery_needs_an_address_and_vouchers_expire` |
| S9 | Collected at the outlet or delivered | done | `test_market.py::test_redeem_spends_only_spendable_points_and_issues_a_voucher` (collect once) |
| S10 | My orders | done | `e2e/store.spec.ts` ("Ready to collect") |
| S11 | Partner portal: products, price, stock, pickup outlets or delivery areas | done | Products with the points-price band, stock and fulfilment; pickup outlets managed in the portal (`/partner/outlets`, `components/store/partner.tsx Outlets`, `test_partner_manages_pickup_outlets`) |
| S12 | See redemptions; scan or type voucher codes | done | `components/store/partner.tsx` (BarcodeDetector, typed fallback; D28); `test_market.py::test_redeem_…` |
| S13 | CSR impact report with trees, survival, cooling, people, photos | done | `services/reports.py impact_report_pdf`; `test_market.py::test_partner_prices_stay_within_the_band` (`/partner/report` PDF) |
| S14 | Spend only spendable; no overdraw or oversell | done | `test_market.py::test_no_oversell_monthly_limits_and_concurrent_spends`; `test_act.py::test_spending_never_overdraws_and_ledger_is_append_only`; `e2e/store.spec.ts` |
| S15 | Limits per person per month and per device | done | `services/store.py redeem` (person 4, device 6 via `atmos_device`, per-product); `test_market.py::test_no_oversell_…` (product limit). Person and device limits have no direct test |
| S16 | GPS photo + automated location check; flagged trees reviewed | done | `test_act.py::test_failed_checks_wait_for_review_by_someone_else`, `::test_duplicate_photo_is_caught`; `test_act_engines.py::test_each_failure_gives_its_reason` |
| S17 | No cash value, no transfer, in the terms | done | `e2e/store.spec.ts` ("Points hold no cash value"); no transfer endpoint exists |

## M · Company marketplace (§6.10)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| M1 | Register with private documents | done | `e2e/store.spec.ts` "company: register with documents, wait for review; admin screens stay closed (M1, M2)"; `test_market.py::test_company_flow_trees_held_then_released_and_no_points` |
| M2 | Admin review before going live | done | `test_market.py::test_company_flow_…` (`company.not_approved` until approved) |
| M3 | Emissions profile, labelled as the company's figure | done | `test_market.py::test_company_flow_…` (`company_reported`) |
| M4 | Pick a package, pay, list products | done | `test_market.py::test_store_listing_package_opens_the_partner_portal`. Built, not verified live: SSLCommerz payment not run in a browser |
| M5 | Tree impact package, per tree | done | `test_market.py::test_company_flow_…` |
| M6 | Carbon credits disabled until certified | done | `test_market.py::test_credits_sell_only_when_certified_and_only_once` |
| M7 | Store listing package | done | `test_market.py::test_store_listing_package_opens_the_partner_portal` |
| M8 | Overview: trees, CO₂e, people, redemptions | done | `services/company.py overview`; `test_market.py::test_company_flow_…` |
| M9 | Buy: packages, cart, checkout | blocked | Decision D31: one package per checkout (no multi-package cart), because packages differ in invoicing, held money and lot rules. Package list, quantity, payment method and checkout work (`components/store/company.tsx`, `test_company_flow_trees_held_then_released_and_no_points`) |
| M10 | Products (as S11) | done | As S11 (`test_partner_manages_pickup_outlets`, `test_partner_prices_stay_within_the_band`) |
| M11 | Redemptions: voucher list, scan or type | done | As S12 (`components/store/partner.tsx`) |
| M12 | Certificates and CSR report as PDF | done | `test_market.py::test_credits_sell_only_when_certified_and_only_once`, `::test_company_flow_…`; `services/reports.py` |
| M13 | Billing: VAT invoices and payment history | done | `GET /company/invoices`, invoice PDF (`test_market.py::test_company_flow_…`); `components/store/company.tsx` |
| M14 | SSLCommerz hosted page, bank transfer, validation incl. amount, idempotent IPN | done | `services/payments.py handle_callback`; `test_market.py::test_saplings_checkout_is_validated_and_idempotent` (wrong amount refused, IPN idempotent); `admin_confirm_transfer`. Built, not verified live: sandbox session and validation API reached, no full browser checkout, IPN needs a public URL (D27) |
| M15 | VAT invoice; tree money held, released per verified tree | done | `test_market.py::test_company_flow_…` (held 1,500, released 1,500); `models/company.py PayoutLedger` |
| M16 | Credit lots; no tonne sold twice | done | `test_market.py::test_credits_sell_only_when_certified_and_only_once` (database refuses resale) |
| M17 | Credits only after registration and audit | done | same test (`/admin/credit-lots/{id}/certify` with standard, project id, auditor) |
| M18 | "Estimate, not an offset" on purchase page, invoice, report | done | `services/reports.py ESTIMATE_LINE`; `components/store/company.tsx` (`estimateLine`); `test_market.py::test_company_flow_…` |
| M19 | `project_id` on lots | done | `test_market.py::test_credits_…` |
| M20 | Lawyer check before selling credits | blocked | Human task (§14): legal review in Bangladesh. Credits stay disabled until a lot is certified |
| M21 | A test proves payments create no points | done | `test_market.py::test_company_flow_trees_held_then_released_and_no_points`, `::test_saplings_checkout_is_validated_and_idempotent` |
| M22 | Points prices within a band | done | `test_market.py::test_partner_prices_stay_within_the_band` |
| M23 | S14–S17 apply everywhere | done | Company listings use the same `services/store.py redeem`; S14–S17 tests |

## R · Business model (§6.11)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| R1 | Tree marketplace commission | done | As S5 (`test_market.py::test_saplings_…`: 10 % commission recorded). Built, not verified live: SSLCommerz checkout |
| R2 | Partner store fees: listing fee + recorded fee per verified tree | done | Listing fee (`store_listing_fee_bdt`) and a recorded fee per verified tree (`FEE_PER_TREE_BDT`, platform ledger line in `services/company.py allocate`; asserted in `test_company_flow_trees_held_then_released_and_no_points`) |
| R3 | Sponsored drives: sponsor logo on the event and certificate | done | Sponsor name and moderated logo on events; participation certificate PDF for people who checked in (`/events/{id}/sponsor-logo`, `/events/{id}/certificate.pdf`, `test_events_rsvp_checkin_and_reminders`) |
| R4 | CSR impact reports (subscriptions deferred) | done | As S13 |
| R5 | Carbon credits and grants: ledger only | done | As M16 |
| R6 | Planting service | blocked | Deferred by §6.11: needs real local teams |
| R7 | Adopt a tree | blocked | Deferred by §6.11: needs R6 and foreign payments |
| R8 | Cool-roof leads | blocked | Deferred by §6.11: no partner |
| R9 | Org exports (paid plans deferred) | done | `GET /orgs/{id}/export.csv` for org admins, link on the org page (`test_org_admin_exports_team_numbers_as_csv`) |
| R10 | Cache scans by H3 cell | done | As Z3 |
| R11 | Keep the 5-a-day guest Ask limit | done | `test_ask.py::test_guest_limit_unknown_storage_and_feedback` |
| R12 | Compress check-in photos to ≤ 1600 px on the phone | done | `components/camera/capture.ts` (`MAX_EDGE = 1600`) |
| R13 | Partners fund rewards | done | Store products are partner-given (`services/store.py`); payments never create points (M21 tests) |
| R14 | 15-day check-in with a streak badge | done | `engines/trees.py` (15 days); `test_act_engines.py::test_on_time_window_and_tips`; B8 |
| R15 | Monthly area leaderboards that reset | done | As C11 (`test_stage8.py::test_month_starts_on_the_first_in_dhaka`) |
| R16 | Show product dates so stale listings are visible | done | `listed_at` and `updated_at` on products, shown on the product page and the partner list (`services/store.py product_out`) |

## K · Ask Atmos without an LLM (§6.12)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| K1 | Keyword intents per language; screen topic fallback; chips send intent ids | done | `test_ask.py::test_classify`, `::test_short_follow_ups_use_the_screen_topic`; `e2e/ask.spec.ts` "a suggestion chip answers with real numbers and sources (K1–K4)" |
| K2 | The 15 intents | done | `services/ask.py INTENTS` |
| K3 | Same services; templates in 10 languages; real numbers | done | `i18n/messages/*/server.json` (`server.ask.answer`, 52 keys in each of 10 locales); `test_ask.py::test_why_hot_streams_real_numbers_with_sources_and_actions`; `e2e/ask.spec.ts` (Bangla) |
| K4 | Warnings first | done | `test_ask.py::test_warnings_come_first` |
| K5 | Unknown question: say what Atmos can answer, offer chips | done | `test_ask.py::test_guest_limit_unknown_storage_and_feedback` |
| K6 | No medical or chemical doses; fixed safety text | done | `test_ask.py::test_safety_and_account_intents` |
| K7 | No photo attachment in Ask | done | `components/ask/ask-panel.tsx` (no file input; links to tree check-in) |
| K8 | Under 2 s; feedback and unanswered questions stored | done | `e2e/ask.spec.ts` (< 2,000 ms); `test_ask.py::test_guest_limit_unknown_storage_and_feedback` |
| K9 | Rewrite "AI chat" copy | done | `e2e/about.spec.ts` (no "AI" or "OpenAI") |

## W · Built beyond V0 (§6.13)

| ID | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- |
| W1 | Landing page, metadata, sitemap, robots, hreflang | done | `e2e/landing.spec.ts` "landing: hero, live NASA sources, hreflang, sitemap and robots (W1)", "landing in Urdu is right to left"; `app/sitemap.ts`, `app/robots.ts` |
| W2 | Web push: VAPID, subscribe, quiet hours, SW handlers, Settings toggle, off without keys | done | `test_push.py` (all 5 tests); `e2e/push.spec.ts`; `jobs/push.py`. Built, not verified live: no VAPID keys set (D29) |

## Blocked items

| ID | Reason |
| --- | --- |
| E3 | Partial: one bounded forecast call remains in the request for a never-seen place; all timing targets met |
| Z2 | Partial: OSM building and road detail on heat cells not written |
| M9 | Decision D31: one package per checkout, no cart |
| M20 | Human task: lawyer review before selling credits |
| R6 | Deferred by the plan (§6.11) |
| R7 | Deferred by the plan (§6.11) |
| R8 | Deferred by the plan (§6.11) |

## Built, not verified live

These are done in code and tests (upstream mocked) and degrade honestly, but the live service was not exercised:

- **A3** Phone OTP: Twilio credentials are empty; the console provider works in development only.
- **C4** Photo moderation: no Google Vision key, so photos go to the manual moderator queue.
- **W2** Web push: no VAPID keys set; the Settings switch says "not set up" (`python -m app.scripts.make_vapid` prints a pair).
- **M14** SSLCommerz: the sandbox accepted a session and the validation API answered, but no full browser checkout was run, and the IPN needs a public URL.
- **M4**, **S5**, **R1**: package and sapling payments go through M14, so they share its gap.

Other source notes: Earthdata URS was unreachable from the build machine, so the token path is used (D14); ECOSTRESS reads sometimes fail and the heat pipeline continues on Landsat (Z2); GPWv4 is not loaded (`make static-data`, `docs/v1/source-check.md`).
