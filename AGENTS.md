# Atmos X: monorepo rules (humans + agents)

## Apps
| Path | State | Notes |
| --- | --- | --- |
| `apps/web` | **active (v0)** | Next.js 16 landing + web app + PWA. See `prompt-v0.md`. |
| `apps/mobile` | **frozen** | Old Expo app. Visual and UX source of truth. Read it, never edit it. Run it: `cd apps/mobile && npm i && npx expo start --web`. |
| `apps/api` | empty | FastAPI + Postgres, built in v1 (`prompt-v1.md`). |

Plans: `prompt-v0.md` (presentable MVP, current), `prompt-v1.md` (full MVP), `DEV-CHECKLIST.md` (human tasks).

## Rules
- Read `apps/web/AGENTS.md`: Next.js 16 differs from your training data. Read `apps/web/node_modules/next/dist/docs/` before using an API. `middleware.ts` is now **`src/proxy.ts`**.
- Screens get data **only** through `apps/web/src/lib/data/hooks`. The contract types are in `apps/web/src/lib/data/types.ts` (snake_case, mirrors prompt-v1 §5). No demo numbers inside screens.
- The OpenAI key is **server-only** (`src/server/**`, `src/app/api/v0/**`). Never use `NEXT_PUBLIC_` for secrets. Never print `.env.local`.
- No hard-coded user-facing strings. Use next-intl messages in `src/i18n/messages/{locale}/{namespace}.json`.
- Every screen has loading, error, empty and guest-restricted states, plus dark mode, RTL (ur, ar), 360 px and 1280 px layouts.
- Stay inside the folders your prompt owns. Don't run `npm install`; ask the Integrator to add a dependency.
- Agents working in parallel in the same tree: **don't run `next build` or `next dev`** (the Integrator does). Use `npm run typecheck`, `npm run lint` and `npm test`, and only fix errors in your own files.
- Finish with a handoff note: `docs/handoff/v0-<id>.md`.

## Commands (apps/web)
`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run probe` · `npm run snapshot:dhaka` · `npm run i18n:translate` · `npm run i18n:check`
