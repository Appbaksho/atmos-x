# apps/web

The Atmos X landing page, web app and installable PWA (Next.js 16, React 19, next-intl, TanStack Query, MapLibre). It holds no backend secrets: every request goes to the FastAPI service through the `/api/v1` and `/media` rewrites in `next.config.ts` (`API_ORIGIN`).

## Run

From the repo root: `make env` (writes `.env.local` with the web variables only), then `make dev`, or just this app with `npm run dev` while the API runs on `API_ORIGIN`.

## Layout

| Path | What |
| --- | --- |
| `src/app/[locale]/(marketing)` | Landing page (`/`), server-rendered with live `/sources` |
| `src/app/[locale]/(app)/app/**` | App screens; `src/proxy.ts` handles locales and the `atmos_device` cookie |
| `src/components/**` | Screens by feature; `components/cz` is the design kit and app shell |
| `src/lib/data/hooks` | The only way screens get data (TanStack Query over the generated client) |
| `src/lib/data/types.ts`, `src/lib/api/` | Contract types and the OpenAPI client (`make gen-client`) |
| `src/i18n/messages/{locale}` | Messages for 10 locales; `npm run i18n:merge` and `npm run i18n:check` |
| `public/sw.js` | Service worker: app shell, public `/api/v1` reads, web push |
| `e2e/` | Playwright specs (Chromium only); the fixture fails on console errors and 404s |

## Checks

`npm run lint` · `npm run typecheck` · `npm test` (vitest) · `npm run build` · `npm run i18n:check` · `make e2e` from the root.
