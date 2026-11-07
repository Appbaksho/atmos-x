/**
 * The data context: who "me" is (from the server session), the namespace for query keys, the
 * request language and device prefs (prompt-v1 §6.2).
 *
 *   GET /auth/me → that user (guest, user or demo)
 *   401          → POST /auth/guest (every app visitor gets a server guest, upgraded in place on sign-up)
 *   prefs.presentation ↔ demo user: POST /auth/demo, and /auth/demo/exit restores the previous session
 *
 * Prefs stay in IndexedDB for an instant first paint and mirror to PATCH /me/profile. On first load
 * the server profile wins once it is onboarded; a fresh server profile takes the device's prefs.
 * Offline, the last known session is reused so the shell still renders.
 *
 * React reads it through useSyncExternalStore (hooks/context.ts); async code calls currentContext().
 */
import { api, call, type Schemas } from '@/lib/api/client';
import { DEFAULT_PREFS, getPrefs, setPrefs, subscribePrefs, type Prefs } from '@/lib/prefs-store';

import { DataError } from '../errors';
import type { Locale } from '../types';
import type { ProfileKind } from './guest';

export type Me = Schemas['UserOut'];
type ServerProfile = Schemas['ProfileOut'];

export type DataContext = {
  ready: boolean;
  ns: string;
  kind: ProfileKind;
  userId: string;
  displayName: string;
  email: string | null;
  createdAt: string | null;
  presentation: boolean;
  lang: Locale;
  prefs: Prefs;
  role: Me['role'];
  avatarUrl: string | null;
  /** true when the server could not be reached and the last known session is shown */
  offline: boolean;
};

const GUEST: DataContext = {
  ready: false,
  ns: 'guest',
  kind: 'guest',
  userId: 'guest',
  displayName: '',
  email: null,
  createdAt: null,
  presentation: false,
  lang: DEFAULT_PREFS.lang,
  prefs: DEFAULT_PREFS,
  role: 'guest',
  avatarUrl: null,
  offline: false,
};

const SESSION_KEY = 'atmos:session:v1';

let state: DataContext = GUEST;
const listeners = new Set<() => void>();

export const getDataContext = (): DataContext => state;
export const getServerDataContext = (): DataContext => GUEST;

export function subscribeDataContext(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function publish(next: DataContext) {
  state = next;
  listeners.forEach((l) => l());
}

let me: Me | null = null;
let offline = false;
/** Last profile values known to be on the server (to send only real changes). */
let serverPrefs: Partial<Prefs> | null = null;
let lastPrefs: Prefs | null = null;
let generation = 0;

function remember(m: Me | null) {
  try {
    if (m) localStorage.setItem(SESSION_KEY, JSON.stringify(m));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage unavailable
  }
}

function recall(): Me | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}

/**
 * POST /auth/guest returns the signed-in user when there is a session, and creates a server guest
 * otherwise. Using it (rather than GET /auth/me → 401) keeps the console free of auth errors.
 */
async function guest(lang: Locale): Promise<Me> {
  return (await call(api.POST('/api/v1/auth/guest', { body: { lang } }))).user;
}

function fromServer(p: ServerProfile): Partial<Prefs> {
  return {
    radius_m: p.radius_m,
    lang: p.lang,
    unit: p.unit,
    area: p.area_unit,
    theme: p.theme,
    farmer_mode: p.farmer_mode,
    ask_on: p.ask_on,
    onboarded: p.onboarded,
  };
}

const SYNC_KEYS = ['radius_m', 'lang', 'unit', 'area', 'theme', 'farmer_mode', 'ask_on', 'onboarded'] as const;

function diff(p: Prefs): Record<string, unknown> | null {
  if (!serverPrefs) return null;
  const out: Record<string, unknown> = {};
  for (const k of SYNC_KEYS) {
    if (p[k] !== serverPrefs[k]) out[k === 'area' ? 'area_unit' : k] = p[k];
  }
  return Object.keys(out).length ? out : null;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePush(p: Prefs) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const patch = diff(p);
    if (!patch || !me) return;
    void call(api.PATCH('/api/v1/me/profile', { body: patch }))
      .then((prof) => {
        serverPrefs = fromServer(prof);
      })
      .catch(() => undefined);
  }, 400);
}

/** Pull the server profile once per user: server wins when onboarded, else it takes the device prefs. */
async function syncProfile(p: Prefs): Promise<Prefs> {
  const prof = await call(api.GET('/api/v1/me/profile'));
  serverPrefs = fromServer(prof);
  if (prof.onboarded || !p.onboarded) {
    const patch: Partial<Prefs> = {};
    for (const k of SYNC_KEYS) if (serverPrefs[k] !== undefined && serverPrefs[k] !== p[k]) (patch as Record<string, unknown>)[k] = serverPrefs[k];
    if (Object.keys(patch).length) return setPrefs(patch);
    return p;
  }
  schedulePush(p);
  return p;
}

function contextFor(m: Me | null, p: Prefs): DataContext {
  if (!m) return { ...GUEST, ready: true, lang: p.lang, prefs: p, offline };
  return {
    ready: true,
    ns: `user:${m.id}`,
    kind: m.role === 'guest' ? 'guest' : 'user',
    userId: m.id,
    displayName: m.display_name,
    email: m.email ?? null,
    createdAt: m.created_at,
    presentation: !!m.is_demo,
    lang: p.lang,
    prefs: p,
    role: m.role,
    avatarUrl: m.avatar_url ?? null,
    offline,
  };
}

let syncedFor: string | null = null;

async function resolveSession(p: Prefs, refresh: boolean): Promise<void> {
  try {
    if (refresh || !me) me = await guest(p.lang);
    if (p.presentation && !me.is_demo) {
      me = (await call(api.POST('/api/v1/auth/demo', { body: { lang: p.lang } }))).user;
    } else if (!p.presentation && me.is_demo) {
      const back = await call(api.POST('/api/v1/auth/demo/exit'));
      me = back?.user ?? (await guest(p.lang));
    }
    offline = false;
    remember(me);
  } catch (e) {
    if (!(e instanceof DataError) || e.status !== 0) throw e;
    offline = true;
    me = me ?? recall();
  }
}

async function recompute(prefs?: Prefs, opts: { refresh?: boolean } = {}): Promise<DataContext> {
  const gen = ++generation;
  let p = prefs ?? lastPrefs ?? (await getPrefs());
  lastPrefs = p;
  const wasDemo = !!me?.is_demo;
  await resolveSession(p, !!opts.refresh);
  if (me && !offline && (syncedFor !== me.id || wasDemo !== !!me.is_demo)) {
    syncedFor = me.id;
    try {
      p = await syncProfile(p);
      lastPrefs = p;
    } catch {
      // profile sync is best-effort; prefs stay local
    }
  } else if (me && !offline) {
    schedulePush(p);
  }
  if (gen === generation) publish(contextFor(me, p));
  return state;
}

let init: Promise<DataContext> | null = null;

/** Idempotent: loads prefs + session once and follows prefs changes afterwards. */
export function ensureDataContext(): Promise<DataContext> {
  if (!init) {
    subscribePrefs((p) => void recompute(p).catch(() => undefined));
    init = recompute().catch(() => {
      offline = true;
      const next = contextFor(recall(), lastPrefs ?? DEFAULT_PREFS);
      publish(next);
      return next;
    });
  }
  return init;
}

/** Latest context after init (use in mutations and query functions). */
export async function currentContext(): Promise<DataContext> {
  await ensureDataContext();
  return state;
}

/** Re-read the session from the server (after login / logout / register). */
export async function refreshDataContext(): Promise<DataContext> {
  await ensureDataContext();
  syncedFor = null;
  return recompute(undefined, { refresh: true });
}

/** Set the session user directly from an auth response (saves a round trip). */
export async function adoptSession(user: Me): Promise<DataContext> {
  await ensureDataContext();
  me = user;
  syncedFor = null;
  remember(user);
  return recompute();
}

/** Tests only. */
export function __resetDataContext(): void {
  state = GUEST;
  init = null;
  lastPrefs = null;
  me = null;
  serverPrefs = null;
  syncedFor = null;
}
