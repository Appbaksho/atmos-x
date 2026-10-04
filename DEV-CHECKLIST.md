# Atmos X: developer manual checklist

> **Who this is for:** the people on the Atmos X team, not the agents. These are the jobs a human has to do: creating accounts, collecting keys, filling in env files, setting up phones and the presentation, and server access.
> **When to use it:**
> - **§1–§2** for **v0**, the presentable MVP ([prompt-v0.md](prompt-v0.md)), today.
> - **§3–§4** for **v1**, the full MVP ([prompt-v1.md](prompt-v1.md)). **Start §3 today**, because approvals take time.
> - **§5** is for later.
>
> Tick the boxes as you go. Write the owner's initials next to each item.

---

## 0. Rules for secrets (everyone)

- [ ] Secrets go **only** in gitignored env files:
  - v0: `apps/web/.env.local`
  - v1: `apps/api/.env`, with the Earth Engine key file in `apps/api/secrets/`
- [ ] Never paste keys into chat, issues, commits, screenshots or the presentation.
- [ ] Share keys through a password manager (Bitwarden or 1Password shared vault), not WhatsApp or Slack.
- [ ] Before every push, run `git status`. Check that no `.env*`, `secrets/` or `*.json` key file is staged.
- [ ] Pick **one person** to own each account (OpenAI, Earth Engine, Earthdata, VPS) and write their name here:

  | Account | Owner |
  | --- | --- |
  | OpenAI | |
  | Earth Engine | |
  | Earthdata | |
  | VPS | |

---

## 1. Before v0 starts (today, about 30 min)

### 1.1 Tools on every developer machine
- [ ] **Node.js 20.9 or newer** (22 LTS recommended; check the minimum in the current Next.js docs). Check with `node -v`.
- [ ] **npm** (bundled with Node) and **git**.
- [ ] **Chrome** (for DevTools, Lighthouse and PWA install testing).
- [ ] Optional: **cloudflared**, for HTTPS on phones (§1.4): `brew install cloudflared`.

### 1.2 OpenAI (the only key v0 needs)
The key is already in the **root `.env`**. The V0-0 agent moves it to `apps/web/.env.local`.
- [ ] Confirm the key is from a **project-scoped key** at platform.openai.com → *API keys*, not a personal or legacy key.
- [ ] **Billing:** platform.openai.com → *Settings → Billing*. At least about **$10** of credit should be available. v0 plus translation and testing should cost less than that.
- [ ] **Spend limit:** *Settings → Limits*. Set a monthly budget for the project (for example $20), so a public demo URL can't run up a bill.
- [ ] **Model names:** at platform.openai.com/docs/models, choose:
  - a current model that supports **tool calling + vision**, for `OPENAI_MODEL`
  - a cheaper model, for `OPENAI_MODEL_CHEAP` (explanations and translations)

  Put both in `apps/web/.env.local`.
- [ ] After V0-0, check that `apps/web/.env.local` contains `OPENAI_API_KEY` and that the root `.env` is gone (or still gitignored).

### 1.3 OpenStreetMap services (no keys, but follow the rules)
- [ ] Set `OSM_USER_AGENT` in `apps/web/.env.local` to `AtmosX/0.1 (<a real team email>)`. Nominatim's usage policy requires a contact address, and it allows at most 1 request per second.
- [ ] Nothing to sign up for:
  - **Open-Meteo** (forecast, archive, air quality, geocoding). Free for non-commercial use; credit "Open-Meteo, CC BY 4.0".
  - **OpenFreeMap** tiles.
  - **Overpass**.
  - **Nominatim**.
  - **NASA GIBS** tiles.

### 1.4 HTTPS so phones can use the camera, location and PWA install
Phones only allow the camera, geolocation and "Install app" over **HTTPS**. Pick one option:
- [ ] **Cloudflare quick tunnel** (recommended for testing, no account):
  1. `cd apps/web && npm run build && npm start`
  2. In another terminal: `cloudflared tunnel --url http://localhost:3000`
  3. Open the printed `https://….trycloudflare.com` address on the phone.

  The URL **changes every run**, and an installed PWA is tied to that URL, so for the presentation keep one tunnel running the whole time, or use the next option.
- [ ] **Deploy to the `inovate` VPS** behind Caddy with a real domain. This is the most stable option for the presentation; see §2.1.
- [ ] (Not recommended) `next dev --experimental-https` on the local network. Phones won't trust the certificate without extra setup.

### 1.5 Things the team must provide to the agents
- [ ] **The landing page design** (Figma link, Claude design link, or images). Paste it into the **V0-9** prompt in place of `<PASTE THE LANDING DESIGN LINK / IMAGES HERE>`.
- [ ] Team **names, roles and photos** (optional) for the landing page, plus the final **app icon** if it differs from `apps/mobile/assets/images/icon.png`.
- [ ] **Confirm the 10 languages:** en, bn, ur, hi, ar, es, fr, pt, id, zh. Swap any of them before V0-1 starts.
- [ ] Someone who reads **Bangla** and someone who reads **Urdu** for a 20-minute spot-check after V0-8.

---

## 2. Presentation prep (v0)

### 2.1 Hosting for the presentation (decide by the afternoon before)
- [ ] Choose one:
  - **(a)** A laptop running `npm start` + a cloudflared tunnel, started once and left running.
  - **(b)** The VPS `inovate`: `ssh inovate`, check what's already running (`docker ps`, ports 80/443) **before** changing anything, then run the Next.js app behind Caddy on a subdomain.

  If you pick (b):
  - [ ] Point the subdomain at the VPS IP with a DNS `A` record.
  - [ ] Copy the env file to the server. Never commit it.
- [ ] Note the final URL here: `______________________`

### 2.2 Morning of the presentation
- [ ] `git pull` and `npm ci && npm run build`.
- [ ] Run **`npm run snapshot:dhaka`** to refresh the offline safety-net data, and commit it if it changed.
- [ ] `npm run probe`: every endpoint should report OK with `live: true`.
- [ ] Check the OpenAI **billing balance** and the **usage** page; there should be headroom.
- [ ] Run the full demo script (prompt-v0.md §8) once on the presentation phone.

### 2.3 The presentation phone (Android recommended)
- [ ] Charged, Do Not Disturb on, notifications off, brightness up.
- [ ] Chrome is up to date. Install the PWA from the final URL; it should open in standalone mode.
- [ ] Location permission is granted. **Presentation mode** is on (Settings → Presentation mode, or open the app with `?demo=1`).
- [ ] Language order planned: start in **বাংলা**, switch to **اردو** at the end to show RTL.
- [ ] A small plant or sapling is at hand for the **camera + AI verification** step.
- [ ] **Screen mirroring** tested on the projector:
  - Android: `brew install scrcpy`, turn on USB debugging, then run `scrcpy`.
  - iPhone: QuickTime Player → *New Movie Recording* → choose the iPhone (with a cable).
- [ ] **Backup:** a screen recording of the full demo saved locally, in case the network fails.
- [ ] **Offline test:** with the cache warm, airplane mode still lets you get through the demo (AI answers fall back to canned text).

### 2.4 After the presentation
- [ ] If the demo URL was public, **rotate the OpenAI key** (create a new one, update the env, delete the old one).
- [ ] Lower or keep the OpenAI spend limit, as you prefer.

---

## 3. Long-lead items for v1 (**start today**, while v0 is being built)

These take hours to days to be approved. Nothing in v0 depends on them.

### 3.1 Google Earth Engine (critical: the real satellite Heat Score)
- [ ] Sign in with a Google account the team controls.
- [ ] console.cloud.google.com → **New project** (for example `atmos-x-nasa`). Write down the **project ID**: `______________`.
- [ ] *APIs & Services → Library* → enable the **Earth Engine API**.
- [ ] Register the project at **code.earthengine.google.com/register**. Choose **Unpaid usage**, then the category that fits (academia/research, nonprofit or education; describe it as "NASA Space Apps Challenge 2026 hackathon project"). Wait for approval; it's often quick but can take hours.
- [ ] *IAM & Admin → Service Accounts → Create*: name it `atmos-ee`. Grant it **Earth Engine Resource Viewer** and **Service Usage Consumer**.
- [ ] The service account → *Keys → Add key → JSON*. Save the file as `apps/api/secrets/gee-key.json`. **Never commit it.** Store a copy in the password manager.
- [ ] Note the service account email here: `______________@______.iam.gserviceaccount.com`
- [ ] Test it once uv is installed (§4.1):

  ```bash
  cd apps/api && uv run python -c "import ee; ee.Initialize(ee.ServiceAccountCredentials('<sa-email>','secrets/gee-key.json'), project='<project-id>'); print(ee.Number(1).getInfo())"
  ```

  It should print `1`.
- [ ] If approval doesn't arrive in time, v1 C1 uses the no-account fallback (Landsat from Microsoft Planetary Computer). Tell the C1 agent.

### 3.2 NASA Earthdata Login (rain, soil moisture, lightning, ECOSTRESS)
- [ ] Register at **urs.earthdata.nasa.gov** with the team account. Username: `__________`
- [ ] *Profile → Generate Token*. Copy the **bearer token**; it expires after about 60 days, so note the date: `__________`.
- [ ] *Applications → Authorized Apps → Approve More*. Approve **"NASA GESDISC DATA ARCHIVE"** (needed for GPM IMERG). Also approve LP DAAC and NSIDC (SMAP) apps if they're listed, or when the first download prompts you.
- [ ] Test it: search CMR for any IMERG granule, then run

  ```bash
  curl -L -H "Authorization: Bearer $EARTHDATA_TOKEN" -o /dev/null -w "%{http_code}\n" "<file URL>"
  ```

  It should print `200`.

### 3.3 OpenAQ (measured PM2.5 stations, free)
- [ ] Sign up at **explore.openaq.org**, then *Account → API key*. Version 3 of the API requires a key.

### 3.4 Decisions and research a human should own
- [ ] **BMD thresholds:** find an official BMD source for the **cold-wave** and **heavy-rain** categories, and check whether BMD publishes a **machine-readable heat-wave bulletin**. Give the links to the C2/C4 agents.
- [ ] **Species cost list:** a rough current price for each native sapling in Dhaka (neem, krishnachura, jarul, arjun, bokul, mango), plus the cost of white/lime roof paint per m². This improves v1 C5 beyond AI estimates.
- [ ] **Domain name** for production (for example `atmosx.app` or a subdomain of the team domain).

---

## 4. v1 setup on dev machines (when v1 starts)

### 4.1 Tools
- [ ] **Docker Desktop** (for Postgres + PostGIS). Run `docker compose up -d db`; it should report the database as healthy.
- [ ] **Python 3.12 or newer** and **uv**: `brew install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`.
- [ ] Everything from §1.1.

### 4.2 `apps/api/.env` (B1 creates `.env.example`; copy it and fill it in)

| Variable | Where it comes from |
| --- | --- |
| `DATABASE_URL` | Default: `postgresql+asyncpg://atmos:atmos@localhost:5432/atmos` (docker compose) |
| `JWT_SECRET` | `openssl rand -hex 32`. Use a different value per environment. |
| `COOKIE_SECURE` | `false` locally, `true` in production |
| `PUBLIC_WEB_ORIGIN` | `http://localhost:3000` locally |
| `DATA_MODE` | `auto` (live with fixture fallback) |
| `UPLOAD_DIR` | `./data/uploads` |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MODEL_CHEAP` | The same key and models as v0 (§1.2). They move to the API in v1. |
| `ASK_DAILY_LIMIT_USER` / `_GUEST` | 30 / 5 |
| `GEE_PROJECT`, `GEE_SERVICE_ACCOUNT`, `GEE_KEY_FILE` | §3.1 (`./secrets/gee-key.json`) |
| `EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD`, `EARTHDATA_TOKEN` | §3.2 |
| `OPENAQ_API_KEY` | §3.3 |
| `OSM_USER_AGENT`, `OVERPASS_URL` | §1.3 |

### 4.3 `apps/web/.env.local` changes for v1
- [ ] Add `API_ORIGIN=http://localhost:8000` (the Next.js rewrites send `/api/v1/*` there).
- [ ] Keep `OPENAI_API_KEY` in web **only** for `scripts/translate.ts`. Ask Atmos moves to the API.

### 4.4 First run
- [ ] `make db && make seed && make api`, then open `http://localhost:8000/docs`. Every endpoint should be listed.
- [ ] `make gen-client && make web`, then open `http://localhost:3000/app`. Log in with the seeded demo account `nadia@demo.atmos` / `demo1234` (local only; never on production).

---

## 5. Later (after v1, before a public launch)

- [ ] **VPS `inovate`:**
  - [ ] Confirm `ssh inovate` works for the deployer.
  - [ ] List the existing services and ports, and agree on what Atmos X may use.
  - [ ] Install Docker + Compose.
  - [ ] Set up backups (a nightly `pg_dump`).
- [ ] **DNS:** `A` records for the domain and API (if separate), pointing at the VPS. Caddy issues the TLS certificates.
- [ ] **Google OAuth:**
  1. Google Cloud console → *APIs & Services → OAuth consent screen*. Set it up as External, with the app name and logo.
  2. *Credentials → Create OAuth client ID* (Web). Use the redirect URI `https://<domain>/api/v1/auth/oauth/google/callback`.
  3. Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.
- [ ] **Web push:** run `npx web-push generate-vapid-keys`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- [ ] **Object storage** for photos (S3 or MinIO) once uploads outgrow the VPS disk.
- [ ] **Licences and credits:**
  - GMAO credit for GEOS data.
  - OSM ODbL attribution.
  - Open-Meteo and ESA WorldCover (CC BY 4.0).
  - Unsplash credits.
  - **Lemon/Milk** is donationware: donate to the author or replace the font before any commercial use.
- [ ] Review the machine-translated languages with native speakers (`_meta.machine = true` files).
- [ ] Rotate every key that was used during the hackathon.
