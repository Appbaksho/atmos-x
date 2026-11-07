/**
 * Device-level preferences (v0: IndexedDB via idb-keyval; v1: mirrored to PATCH /me/profile).
 * Shared contract between V0-1 (the React prefs context in src/lib/prefs.tsx) and V0-3 (data hooks).
 * Only touch this file through the Integrator.
 */
import { get, set } from 'idb-keyval';

import type { Profile } from '@/lib/data/types';

export type Prefs = Pick<
  Profile,
  'radius_m' | 'lang' | 'unit' | 'area' | 'theme' | 'farmer_mode' | 'ask_on' | 'onboarded'
> & { presentation: boolean };

export const DEFAULT_PREFS: Prefs = {
  // prompt-v1 §6.4 H3: presets 200 m · 500 m · 1 km, default 200 m
  radius_m: 200,
  lang: 'en',
  unit: 'C',
  area: 'metric',
  theme: 'system',
  farmer_mode: false,
  ask_on: true,
  onboarded: false,
  presentation: false,
};

const KEY = 'atmos:prefs:v1';
type Listener = (p: Prefs) => void;
const listeners = new Set<Listener>();
let current: Prefs | null = null;
/** The first storage read, shared so concurrent callers never race on an empty `current`. */
let loading: Promise<Prefs> | null = null;

async function load(): Promise<Prefs> {
  try {
    const stored = typeof indexedDB === 'undefined' ? undefined : await get<Partial<Prefs>>(KEY);
    return { ...DEFAULT_PREFS, ...(stored ?? {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function getPrefs(): Promise<Prefs> {
  if (current) return current;
  loading ??= load().then((p) => (current ??= p));
  return loading;
}

export async function setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
  await getPrefs();
  // Read `current` after the await so back-to-back setPrefs calls build on each other.
  const next = { ...(current as Prefs), ...patch };
  current = next;
  try {
    await set(KEY, next);
  } catch {
    // storage unavailable (private mode): keep in memory only
  }
  listeners.forEach((l) => l(next));
  return next;
}

export function subscribePrefs(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
