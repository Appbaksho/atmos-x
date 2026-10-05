/**
 * The data context: which namespace local hooks read/write, who "me" is, and the request language.
 *
 *   prefs.presentation → ns "demo", me = Nadia (seeded on first switch)
 *   session.profile_id → ns "user:<id>", me = that local account
 *   otherwise          → ns "guest", restricted (prompt-v0.md §4.5)
 *
 * It follows prefs-store (subscribePrefs) and the local session. React reads it through
 * useSyncExternalStore (see hooks/context.ts); plain async code calls currentContext().
 */
import { getPrefs, subscribePrefs, DEFAULT_PREFS, type Prefs } from '@/lib/prefs-store';

import { DEMO_NAMESPACE, DEMO_USER_ID, STORY } from '../seed';
import type { Locale } from '../types';
import { getAccount, readSession, writeSession, type PublicAccount } from './accounts';
import { ensureDemoSeeded } from './demo';
import type { ProfileKind } from './guest';

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
};

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

let lastPrefs: Prefs | null = null;
let generation = 0;

async function recompute(prefs?: Prefs): Promise<DataContext> {
  const gen = ++generation;
  const p = prefs ?? lastPrefs ?? (await getPrefs());
  lastPrefs = p;
  let next: DataContext;
  if (p.presentation) {
    await ensureDemoSeeded();
    next = {
      ready: true,
      ns: DEMO_NAMESPACE,
      kind: 'user',
      userId: DEMO_USER_ID,
      displayName: STORY.user.display_name,
      email: STORY.user.email,
      createdAt: null,
      presentation: true,
      lang: p.lang,
      prefs: p,
    };
  } else {
    const session = await readSession();
    const acc: PublicAccount | null = session.profile_id ? await getAccount(session.profile_id) : null;
    if (session.profile_id && !acc) await writeSession({ profile_id: null });
    next = acc
      ? { ready: true, ns: `user:${acc.id}`, kind: 'user', userId: acc.id, displayName: acc.display_name, email: acc.email, createdAt: acc.created_at, presentation: false, lang: p.lang, prefs: p }
      : { ...GUEST, ready: true, lang: p.lang, prefs: p };
  }
  // a newer recompute started meanwhile: let it win
  if (gen === generation) publish(next);
  return state;
}

let init: Promise<DataContext> | null = null;

/** Idempotent: loads prefs + session once and follows prefs changes afterwards. */
export function ensureDataContext(): Promise<DataContext> {
  if (!init) {
    subscribePrefs((p) => void recompute(p));
    init = recompute();
  }
  return init;
}

/** Latest context after init (use in mutations and query functions). */
export async function currentContext(): Promise<DataContext> {
  await ensureDataContext();
  return state;
}

/** Re-read the session (after login / logout / register). */
export async function refreshDataContext(): Promise<DataContext> {
  await ensureDataContext();
  return recompute();
}

/** Tests only. */
export function __resetDataContext(): void {
  state = GUEST;
  init = null;
  lastPrefs = null;
}
