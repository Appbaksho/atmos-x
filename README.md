# Atmos X

Find the hottest blocks around you, get a concrete cooling plan, team up, and (for farmers) get crop and weather alerts, in 10 languages. NASA Space Apps Challenge 2026.

## Monorepo

| Path | What |
| --- | --- |
| `apps/web` | **Next.js 16 landing + web app + installable PWA** (v0, active) |
| `apps/api` | FastAPI + Postgres backend (v1, not started) |

Atmos X ships only as a web app + installable PWA; there is no native app. The original Expo prototype was removed (it's in git history at commit `9841c47`, under `apps/mobile`).

## Run v0

```bash
cd apps/web
cp .env.example .env.local   # then add OPENAI_API_KEY
npm install
npm run dev                  # http://localhost:3000
```

## Plans
- [prompt-v0.md](prompt-v0.md): presentable MVP (web + PWA + OpenStreetMap + OpenAI)
- [prompt-v1.md](prompt-v1.md): full MVP (FastAPI, Postgres, NASA data)
- [DEV-CHECKLIST.md](DEV-CHECKLIST.md): keys, env, phones, presentation, the human jobs
