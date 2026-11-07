/**
 * Prototype screen IDs → web paths (prompt-v0 §4.3). Screens navigate with `go('S06', { id })` so
 * cross-links stay stable no matter which file a screen lives in. Same IDs as
 * apps/mobile/src/lib/cz/routes.ts.
 *
 * - `go`, `goPath`, `goBack` are plain functions (work anywhere on the client, like the Expo
 *   router). They use next-intl's router, bound by <RouterBridge/> in the app shell, so the locale
 *   prefix is kept automatically.
 * - `href(id, params, query)` builds a locale-less path for `<Link href>` / `<Tap href>`.
 * - Params that are not path segments become query params: go('S08', { zone: 'z-…' }) →
 *   /app/goal/new?zone=z-…
 * - A dynamic route called without its param falls back to its parent screen (S06 → S05 map).
 * - go('S29') opens the Ask Atmos panel instead of navigating.
 */
import type { ScreenId } from '@/lib/data/types';

export const ROUTES = {
  S01: '/app/onboarding/welcome',
  S02: '/app/onboarding/language',
  S03: '/app/onboarding/location',
  S04: '/app',
  S05: '/app/map',
  S06: '/app/zone/[id]',
  S07: '/app/zone/[id]/projection',
  S08: '/app/goal/new',
  S09: '/app/goal/[id]/feasibility',
  S10: '/app/plan',
  S11: '/app/species/[id]',
  S12: '/app/nurseries',
  S13: '/app/budget',
  S14: '/app/log-action',
  S15: '/app/contribution/[id]',
  S16: '/app/community',
  S17: '/app/team/[id]',
  S18: '/app/org/[id]',
  S19: '/app/team/new',
  S20: '/app/profile',
  S21: '/app/notifications',
  S22: '/app/settings',
  S26: '/app/air',
  S27: '/app/air/devices',
  S28: '/app/air/add',
  /** Ask Atmos is a panel, not a route: go('S29') opens it. */
  S29: '',
  F01: '/app',
  F02: '/app/farm/alert/[id]',
  F03: '/app/farm/fields',
} as const satisfies Record<ScreenId, string>;

/** Routes without a prototype screen ID. */
export const EXTRA_ROUTES = {
  landing: '/',
  tree: '/app/tree/[id]',
  trees: '/app/tree',
  goals: '/app/goal',
  species: '/app/species',
  teams: '/app/team',
  orgs: '/app/org',
  user: '/app/u/[id]',
  post: '/app/post/[id]',
  events: '/app/event',
  event: '/app/event/[id]',
  moderation: '/app/moderation',
  about: '/app/about',
  login: '/auth/login',
  register: '/auth/register',
  join: '/join/[code]',
  kit: '/dev/kit',
} as const;

export type RouteId = ScreenId | keyof typeof EXTRA_ROUTES;
export type RouteParams = Record<string, string | number | null | undefined>;

const ALL: Record<RouteId, string> = { ...ROUTES, ...EXTRA_ROUTES };

/** Tab roots (switching between them is a tab change, not a push, in the prototype). */
export const TAB_IDS: ReadonlySet<ScreenId> = new Set<ScreenId>(['S04', 'S05', 'S10', 'S16', 'S20', 'F01', 'F03']);

/** Where a dynamic route goes when its param is missing. */
const FALLBACK: Partial<Record<RouteId, RouteId>> = {
  S06: 'S05',
  S07: 'S05',
  S09: 'S08',
  S11: 'S10',
  S15: 'S20',
  S17: 'S16',
  S18: 'S16',
  F02: 'F01',
  tree: 'trees',
  join: 'S16',
  user: 'S16',
  post: 'S16',
  event: 'events',
};

/** Build a locale-less path for a screen. */
export function href(id: RouteId, params?: RouteParams, query?: RouteParams): string {
  const pattern = ALL[id];
  const rest: RouteParams = { ...(params ?? {}) };
  let missing = false;
  const path = pattern.replace(/\[([^\]]+)\]/g, (_, key: string) => {
    const v = rest[key];
    delete rest[key];
    if (v == null || v === '') {
      missing = true;
      return '';
    }
    return encodeURIComponent(String(v));
  });
  if (missing) {
    const fb = FALLBACK[id];
    if (process.env.NODE_ENV !== 'production') console.warn(`[routes] ${id} needs params for ${pattern}; falling back to ${fb ?? 'S04'}`);
    return href(fb ?? 'S04', undefined, query);
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...rest, ...(query ?? {}) })) if (v != null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/* ───────────────────────── Imperative navigation ───────────────────────── */

type BoundRouter = {
  push: (path: string) => void;
  replace: (path: string) => void;
  back: () => void;
  prefetch?: (path: string) => void;
};

let router: BoundRouter | null = null;
let navigatedInApp = false;
let askOpener: (() => void) | null = null;

/** Called by <RouterBridge/> (app shell). Porters never call this. */
export function bindRouter(r: BoundRouter | null) {
  router = r;
}
/** Called by <RouterBridge/> on every client-side path change after the first render. */
export function markNavigated() {
  navigatedInApp = true;
}
/** Called by the Ask Atmos slot so go('S29') can open it. */
export function bindAskOpener(fn: (() => void) | null) {
  askOpener = fn;
}

function push(path: string) {
  if (router) router.push(path);
  else if (typeof window !== 'undefined') window.location.assign(path);
}

/** Navigate to a prototype screen (or an extra route like 'tree', 'login'). */
export function go(id: RouteId, params?: RouteParams, query?: RouteParams) {
  if (id === 'S29') {
    askOpener?.();
    return;
  }
  push(href(id, params, query));
}

/** Push a concrete locale-less path (e.g. `/app/zone/z-8a…-500`). */
export function goPath(path: string) {
  push(path);
}

/** Replace the current entry (no back step), e.g. after finishing onboarding. */
export function goReplace(id: RouteId, params?: RouteParams, query?: RouteParams) {
  const p = href(id, params, query);
  if (router) router.replace(p);
  else if (typeof window !== 'undefined') window.location.replace(p);
}

/** Back, falling back to Home (/app) when there is no in-app history (deep links). */
export function goBack() {
  if (navigatedInApp && router && typeof window !== 'undefined' && window.history.length > 1) router.back();
  else if (router) router.replace(ROUTES.S04);
  // Only before <RouterBridge/> has mounted.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  else if (typeof window !== 'undefined') window.location.href = ROUTES.S04;
}

/* ───────────────────────── Path → screen ID ───────────────────────── */

const MATCHERS: [RegExp, ScreenId][] = (Object.entries(ROUTES) as [ScreenId, string][])
  .filter(([id, p]) => p && id !== 'F01')
  .map(([id, p]) => [new RegExp('^' + p.replace(/\[[^\]]+\]/g, '[^/]+') + '/?$'), id]);

/**
 * Screen ID for a locale-less pathname (Ask Atmos context, analytics). Farmer mode maps
 * /app → F01. Returns null for non-screen routes (auth, tree, about…).
 */
export function screenIdForPath(pathname: string, farmer = false): ScreenId | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  for (const [re, id] of MATCHERS) {
    if (re.test(p)) return id === 'S04' && farmer ? 'F01' : id;
  }
  return null;
}
