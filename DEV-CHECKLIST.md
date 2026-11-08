# Atmos X: developer checklist (V1)

> **Who this is for:** the people on the Atmos X team, not the agents. These are the jobs only a human can do: accounts, keys, approvals, legal checks, phones, the presentation and going live.
> Tick the boxes as you go and write the owner's initials next to each item. Status notes reflect the state on 2026-11-08.

---

## 0. Rules for secrets (everyone)

- [ ] Secrets go **only** in the root `.env` (gitignored). The API reads it. `make env` copies only `API_ORIGIN`, `ATMOS_BUILD_ID` and `NEXT_PUBLIC_*` into `apps/web/.env.local`; the web server never holds a backend secret.
- [ ] Never paste keys into chat, issues, commits, screenshots or the presentation. Share them through a password manager.
- [ ] Before every push, run `git status` and check that no `.env*` file is staged (`.env.example` is the only one tracked).
- [ ] One owner per account:

  | Account | Owner |
  | --- | --- |
  | NASA Earthdata | |
  | Google Cloud (OAuth, optional Vision) | |
  | OpenAQ | |
  | SSLCommerz | |
  | SMS gateway | |
  | Server / domain | |

---

## 1. Dev machine (about 20 min)

- [ ] Docker Desktop, Python 3.12+ with **uv**, Node 22 LTS, git, Chrome.
- [ ] `cp .env.example .env`. The core heat loop (satellite Heat Score, map, zones, plans) works with **no third-party keys**.
- [ ] `make env`, then `cd apps/web && npm ci`.
- [ ] `make dev`: Postgres on 127.0.0.1:5433, migrations, reference data, then API on :8000, the worker and web on :3000.
- [ ] Open http://localhost:3000, choose **Try the Dhaka demo** (or `/app?demo=1`).
- [ ] Create yourself an admin: register in the app, then `cd apps/api && uv run python -m app.scripts.make_admin you@example.org`.
- [ ] Optional: `make verify-sources` writes `docs/v1/source-check.md` with one real request per source.

---

## 2. Keys and approvals (do these first; approvals take time)

### 2.1 Security
- [ ] **Rotate the Google OAuth client secret.** It was public on GitHub; scrubbing a file doesn't remove it from history. Create a new secret in Google Cloud → Credentials, put it in `.env` (`GOOGLE_OAUTH_CLIENT_SECRET`), delete the old one.

### 2.2 NASA Earthdata (IMERG rain, SMAP soil, LIS/OTD lightning, ECOSTRESS, GPW)
Status: username, password and token are set. The token works for downloads; `urs.earthdata.nasa.gov` itself was unreachable from the build machine.
- [x] Approve **NASA GESDISC DATA ARCHIVE** and accept its EULA (done 8 Nov 2026; if downloads ever answer "EULA Acceptance Failure" again, open the `resolution_url` in that error while signed in as `EARTHDATA_USERNAME`). LP DAAC, NSIDC and GHRC need no approval: they accept the token.
- [ ] The token expires after about 60 days. Write the expiry here: `__________`. Renew it in *Profile → Generate Token* and update `EARTHDATA_TOKEN`.
- [ ] GPWv4 (population density) needs a SEDAC download that wasn't available to the build; the Heat Score runs without the population term until then.
- [ ] LIS/OTD and GPW static files: run `make static-data` once the approvals are in.

### 2.3 Other data services
- [ ] **`OSM_USER_AGENT`** still holds a placeholder. Set it to `AtmosX/1.0 (<a real team email>)`; Nominatim's policy needs a real contact.
- [ ] OpenAQ key: set and working.
- [ ] Before any commercial launch, subscribe to **Open-Meteo** (free tier is non-commercial).

### 2.4 Sign-in
- [ ] Google sign-in: client id and secret are set. After rotating (§2.1), add every origin you open the app from under *Authorized JavaScript origins* (localhost, tunnel URL, production domain).
- [ ] Phone sign-in: choose an SMS gateway for Bangladesh. The code ships a Twilio Verify adapter (`TWILIO_*` are empty, so phone OTP is off); a local gateway may be cheaper.

### 2.5 Payments (SSLCommerz, sandbox)
Status: sandbox store id and password are set; the session and validation APIs answered. A full browser checkout was **not** run because the IPN needs a public URL.
- [ ] Open the app through a public HTTPS URL (tunnel or server), set `PUBLIC_WEB_ORIGIN` to it, buy saplings in the sandbox with a test card, and check the order turns **paid** with an invoice.
- [ ] Keep `SSLCOMMERZ_SANDBOX=true`. Only a person may switch to a live store, after the business and legal checks below.

### 2.6 Web push
Status: off (no VAPID keys).
- [ ] `cd apps/api && uv run python -m app.scripts.make_vapid`, paste the three lines into `.env` (set a real `VAPID_SUBJECT` mailto), restart the API and worker. Changing the keys later drops every subscription.

### 2.7 Photo moderation
- [ ] Confirm the choice. Default is `MODERATION_PROVIDER=manual` (every public photo waits for a moderator). `google_vision` needs `GOOGLE_VISION_API_KEY`; flagged photos and any failure still go to the queue.
- [ ] Make at least one moderator: `uv run python -m app.scripts.make_admin someone@example.org --moderator`.

---

## 3. Business and legal decisions

- [ ] **Sign a pilot partner** for the points store and a **pilot nursery** for saplings. Until then, real users see empty states; only the invented demo partner and nursery appear in demo mode.
- [ ] Review the proposed prices and limits in `.env.example` (VAT, points per taka and tolerance, monthly limits, package prices) and the cost tables in the seed.
- [ ] **A lawyer checks Bangladesh's rules before any carbon credit sale.** Registering trees under Verra or Gold Standard is a business decision; credits stay disabled until an admin records a certified lot.
- [ ] Decide on deployment (§5). **Lemon/Milk** (the display font) needs a donation or a replacement before commercial use.
- [ ] Assumptions to confirm before anything irreversible: the non-tree points unlock rule (90 days), team size 2–5, tree state thresholds and verification thresholds.

---

## 4. Presentation

- [ ] Use a public HTTPS URL so phones allow camera, location, install and push (a Cloudflare quick tunnel to :3000 is enough for a rehearsal).
- [ ] Run the demo script (prompt-v1 §13.3) once on the presentation phone: install the PWA, onboard in বাংলা, Home live, 200 m then 500 m scan, zone detail, a goal with a plan, planting spots and projection, log a tree with the camera, My trees, Community, Store (pending vs spendable), Air quality, Farmer mode.
- [ ] Have a native **Bangla** and **Urdu** speaker review the strings marked in `_meta.machine_keys` of `apps/web/src/i18n/messages/{bn,ur}/*.json`.
- [ ] Phone: charged, Do Not Disturb, brightness up; location granted; Presentation mode (Settings) or `?demo=1`.
- [ ] Backup: a screen recording of the full demo.

---

## 5. Going live (later)

- [ ] Server with Docker. Copy `.env` (with `APP_ENV=production`, a strong `JWT_SECRET`, `POSTGRES_PASSWORD`, `PUBLIC_WEB_ORIGIN`, `NEXT_PUBLIC_APP_URL`) next to `docker-compose.prod.yml`, then `docker compose -f docker-compose.prod.yml up -d --build`.
- [ ] Install `deploy/atmosx.baksho.app.nginx` (edit the domain), run certbot, point DNS at the server.
- [ ] Backups: a nightly `pg_dump` of the `atmos-pg` volume's database and a copy of the `atmos-data` volume (photos, documents, caches).
- [ ] Object storage for photos once uploads outgrow the disk.
- [ ] Credits and licences: keep the attributions on the landing page and About (they come from `/sources`).
