/**
 * Namespaced collections on top of ./kv. A namespace is `user:<profileId>`, `demo` (Presentation mode)
 * or `guest`. Each collection is one array value under `<ns>:<name>` (small data, v0 scale);
 * photo blobs live under `<ns>:photo:<id>`.
 */
import type { Goal, LatLng, TeamRole } from '../types';
import { getKV, withLock } from './kv';

export type Namespace = string;

export const COLL = {
  goals: 'goals',
  actions: 'actions',
  trees: 'trees',
  checks: 'checks',
  memberships: 'memberships',
  teams: 'teams',
  fields: 'fields',
  sensors: 'sensors',
  notifications: 'notifications',
  notifRead: 'notif_read',
  askUsage: 'ask_usage',
  profile: 'profile',
  heatNotified: 'heat_notified',
  seededAt: 'seeded_at',
} as const;
export type CollName = (typeof COLL)[keyof typeof COLL];

/* ─────────── stored shapes that extend the contract ─────────── */

/** Goal + the zone area used to turn action cooling (per km²) into zone cooling. */
export type LocalGoal = Goal & { zone_area_km2: number };

export type Membership = { team_id: string; role: TeamRole; joined_at: string };

/** A team the user created on this device. */
export type LocalTeam = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  org_id: string | null;
  owner_id: string;
  max_members: number;
  is_public: boolean;
  area: string | null;
  city: string | null;
  country: string | null;
  emoji: string;
  goal_id: string | null;
  created_at: string;
};

export type LocalProfile = { display_name: string | null; home: LatLng | null; avatar_url: string | null };

/* ─────────── primitives ─────────── */

const key = (ns: Namespace, name: string) => `${ns}:${name}`;

export async function readValue<T>(ns: Namespace, name: string): Promise<T | undefined> {
  return (await getKV()).get<T>(key(ns, name));
}

export async function writeValue(ns: Namespace, name: string, value: unknown): Promise<void> {
  await (await getKV()).set(key(ns, name), value);
}

export async function updateValue<T>(ns: Namespace, name: string, fn: (cur: T | undefined) => T): Promise<T> {
  return withLock(key(ns, name), async () => {
    const next = fn(await readValue<T>(ns, name));
    await writeValue(ns, name, next);
    return next;
  });
}

export async function readList<T>(ns: Namespace, name: CollName): Promise<T[]> {
  return (await readValue<T[]>(ns, name)) ?? [];
}

export async function updateList<T>(ns: Namespace, name: CollName, fn: (list: T[]) => T[]): Promise<T[]> {
  return updateValue<T[]>(ns, name, (cur) => fn(cur ?? []));
}

export async function writeList<T>(ns: Namespace, name: CollName, list: T[]): Promise<void> {
  await writeValue(ns, name, list);
}

/* ─────────── photos ─────────── */

export const PHOTO_KEY_PREFIX = 'idb:';

/** Stores a blob; returns the value to put in `photo_url` (`idb:<ns>:photo:<id>`). */
export async function putPhoto(ns: Namespace, id: string, blob: Blob): Promise<string> {
  const k = key(ns, `photo:${id}`);
  await (await getKV()).set(k, blob);
  return PHOTO_KEY_PREFIX + k;
}

export async function getPhoto(photoUrl: string): Promise<Blob | undefined> {
  if (!photoUrl.startsWith(PHOTO_KEY_PREFIX)) return undefined;
  return (await getKV()).get<Blob>(photoUrl.slice(PHOTO_KEY_PREFIX.length));
}

export const isStoredPhoto = (url: string | null | undefined): url is string => !!url && url.startsWith(PHOTO_KEY_PREFIX);

/* ─────────── namespaces ─────────── */

export async function clearNamespace(ns: Namespace): Promise<void> {
  const kv = await getKV();
  const prefix = `${ns}:`;
  const all = await kv.keys();
  await Promise.all(all.filter((k) => k.startsWith(prefix)).map((k) => kv.del(k)));
}
