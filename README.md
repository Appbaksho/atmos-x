# Atmos X

Find the hottest blocks around you with NASA satellite data, get a concrete cooling plan, team up in clans, and (for farmers) get crop and weather alerts in Bangla or English.

Built with Expo SDK 57 (React Native 0.86, TypeScript, Expo Router) and Supabase. NASA Space Apps Challenge 2026.

## Features

The UI follows the **CoolZone** design (claude.ai/design prototype): navy ink, lime actions, Poppins + Lemon/Milk, light & dark themes, English / বাংলা / اردو (Urdu flips the layout right-to-left).

| Tab | What it does |
| --- | --- |
| **Home** | Live air temperature, feels-like (NOAA heat index) and danger level, own-zone Heat Score gauge with causes and a “+ green” what-if, hottest zones, air quality, trees needing a photo, active goal and next task. Farmer mode swaps in field, crop stage and heat alerts. |
| **Map** | Hex heat layer inside your scan radius, legend, near-tie flags, ranked zones → zone detail (observed vs. drivers, 20-year history, projection). Farmer mode shows My fields. |
| **Plan** | Goal wizard, feasibility, ranked cooling actions, species, nurseries, budget, in-app camera to log an action, contribution verification. |
| **Community** | Clans, leaderboards by area/city/country, team dashboard, organization page, create & invite (link / QR / code). |
| **Profile** | Level, badges, my trees (15-day photo checks), notifications, live settings (language, units, theme, farmer mode, Ask Atmos). |

**Ask Atmos** — a floating assistant on every screen that knows where you opened it, answers from Atmos X data with source chips and puts official warnings first (canned answers for now; wire an LLM endpoint in `src/components/cz/ask-atmos.tsx`).

> Live today: weather/feels-like and place name on Home (Open-Meteo + device location). Zones, goals, trees, teams, sensors and farm fields use the prototype’s demo story from `src/lib/cz/demo.ts` until their endpoints are wired; the NASA/Overpass/farmer engines in `src/lib` are ready for that.

## Data sources (no API keys needed)

- **NASA MODIS MOD11A2** land surface temperature via the [ORNL DAAC MODIS web service](https://modis.ornl.gov/data/modis_webservice.html). The app pulls the last 10 eight-day composites and takes the per-pixel median of cloud-free values.
- **NASA POWER** daily + climatology API for air temperature and rainfall.
- **NASA GIBS** WMTS tiles for the monthly LST map overlay.
- **Open-Meteo** 7-day forecast for farmer alerts.
- **OpenStreetMap Overpass** for plant nurseries and garden centres.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL + publishable key
npx expo start
```

Scan the QR code with **Expo Go** (Android/iOS). Everything used here ships in Expo Go, so no custom build is needed for development.

The Heat, Zone, Nursery and Farmer screens work **without** Supabase. Accounts, action logging, clans and leaderboards need the backend.

## Supabase backend

1. Create a project at [database.new](https://database.new).
2. Open **SQL Editor**, paste `supabase/migrations/20261002000000_atmos_x.sql`, run it. (Or with the CLI: `npx supabase link` then `npx supabase db push`.)
3. Copy **Project URL** and **Publishable key** from Project Settings > API into `.env.local`.
4. For quick hackathon testing, turn off **Authentication > Providers > Email > Confirm email** so sign-up logs users straight in.
5. Restart `npx expo start`.

What the schema gives you:

- `profiles` (auto-created on sign-up), `clans`, `clan_members`, `action_types`, `action_logs`
- Row Level Security on every table
- Points, trees and cooling are computed **server-side** by a trigger, so the leaderboard can't be gamed from the client
- RPCs: `get_user_leaderboard`, `get_clan_leaderboard`, `get_my_stats`, `get_clan_stats`, `join_clan_by_code`

## Project layout

```
src/
  app/                 Expo Router routes (thin files that re-export a screen)
    (tabs)/            Home, Map, Plan, Community, Profile + floating tab bar
    onboarding/        Welcome, language & units, location & radius
  screens/             Screen implementations: home, map, plan, act, community, profile, air, farm, onboarding
  components/cz/       CoolZone UI kit (ui.tsx), icons, Ask Atmos
  constants/cz.ts      Design tokens: light/dark palettes, brand colours, heat & AQI scales, fonts
  context/             prefs (language, units, theme, mode; persisted with expo-sqlite kv-store), auth, location
  lib/cz/              Formatting (native digits, °C/°F), routes by screen ID, demo data, hex field, live conditions
  lib/                 NASA MODIS/POWER/GIBS, heat analysis, farmer alerts, weather, nurseries, Supabase API
assets/fonts/          Lemon/Milk display face
supabase/migrations/   Database schema
```

The display font **Lemon/Milk** (Marsnev) is donationware — free for personal, educational and non-profit use; donate to the author before any commercial release.

## Building an APK

```bash
npx eas-cli@latest build -p android --profile preview
```

For the Play Store / App Store you will also need a Google Maps API key for Android (see the Expo `react-native-maps` docs).

## Notes on the science

Cooling estimates are planning figures from urban heat literature: about 0.1–0.2 °C lower daytime surface temperature per +1 % tree canopy in a km² (~200 mature trees), and roughly 0.04 °C per 1 % of a km² of cool roofs. Land surface temperature is how hot roofs and roads get, which is related to, but higher than, air temperature.
