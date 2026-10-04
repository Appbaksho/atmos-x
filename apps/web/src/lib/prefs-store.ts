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
  radius_m: 500,
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

export async function getPrefs(): Promise<Prefs> {
  if (current) return current;
  try {
    const stored = typeof indexedDB === 'undefined' ? undefined : await get<Partial<Prefs>>(KEY);
    current = { ...DEFAULT_PREFS, ...(stored ?? {}) };
  } catch {
    current = { ...DEFAULT_PREFS };
  }
  return current;
}

export async function setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const next = { ...(await getPrefs()), ...patch };
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
