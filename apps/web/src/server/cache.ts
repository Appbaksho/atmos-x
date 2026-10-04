import 'server-only';

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from './env';

/**
 * Two-level cache: an in-memory LRU plus JSON files in apps/web/.cache (gitignored), so a restarted
 * dev server is still warm. TTLs follow prompt-v0.md §4.6. Expired entries are kept and served as a
 * stale fallback when the upstream call fails (`fresh: false`).
 */

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const TTL = {
  weather: 30 * MIN,
  air: HOUR,
  archive: 30 * DAY,
  overpass: 7 * DAY,
  ai: 7 * DAY,
  geo: 30 * DAY,
  scan: 30 * MIN,
} as const;

type Entry<T> = { t: number; ttl: number; v: T };

const MAX_MEM = 400;
const mem = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function memGet<T>(key: string): Entry<T> | undefined {
  const e = mem.get(key) as Entry<T> | undefined;
  if (e) {
    mem.delete(key);
    mem.set(key, e);
  }
  return e;
}

function memSet<T>(key: string, e: Entry<T>) {
  mem.set(key, e);
  if (mem.size > MAX_MEM) {
    const oldest = mem.keys().next().value;
    if (oldest !== undefined) mem.delete(oldest);
  }
}

function fileFor(key: string): string {
  const prefix = key.split(':')[0].replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'k';
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 20);
  return path.join(env.cacheDir, `${prefix}-${hash}.json`);
}

async function diskGet<T>(key: string): Promise<Entry<T> | undefined> {
  try {
    const raw = await readFile(fileFor(key), 'utf8');
    const e = JSON.parse(raw) as Entry<T> & { k?: string };
    if (e.k !== undefined && e.k !== key) return undefined;
    return { t: e.t, ttl: e.ttl, v: e.v };
  } catch {
    return undefined;
  }
}

async function diskSet<T>(key: string, e: Entry<T>) {
  try {
    await mkdir(env.cacheDir, { recursive: true });
    await writeFile(fileFor(key), JSON.stringify({ k: key, ...e }));
  } catch {
    // read-only file system (serverless): memory only
  }
}

const isFresh = (e: Entry<unknown>) => Date.now() - e.t < e.ttl;

/** Read an entry (fresh or not) without computing. */
export async function peek<T>(key: string): Promise<{ value: T; fresh: boolean; at: number } | null> {
  const e = memGet<T>(key) ?? (await diskGet<T>(key));
  if (!e) return null;
  memSet(key, e);
  return { value: e.v, fresh: isFresh(e), at: e.t };
}

export async function put<T>(key: string, value: T, ttlMs: number, persist = true): Promise<void> {
  const e: Entry<T> = { t: Date.now(), ttl: ttlMs, v: value };
  memSet(key, e);
  if (persist) await diskSet(key, e);
}

export type Cached<T> = { value: T; /** false = an expired entry served because the refresh failed */ fresh: boolean; at: number; hit: boolean };

/**
 * Return the cached value for `key`, or compute it with `fn`. Concurrent callers share one call.
 * If `fn` throws and an expired entry exists, that entry is returned with `fresh: false`.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  opts: { persist?: boolean; staleOnError?: boolean } = {},
): Promise<Cached<T>> {
  const { persist = true, staleOnError = true } = opts;
  const hit = memGet<T>(key) ?? (persist ? await diskGet<T>(key) : undefined);
  if (hit && isFresh(hit)) {
    memSet(key, hit);
    return { value: hit.v, fresh: true, at: hit.t, hit: true };
  }
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fn();
    inflight.set(key, p);
    p.finally(() => inflight.delete(key)).catch(() => {});
  }
  try {
    const v = await p;
    const e: Entry<T> = { t: Date.now(), ttl: ttlMs, v };
    memSet(key, e);
    if (persist) await diskSet(key, e);
    return { value: v, fresh: true, at: e.t, hit: false };
  } catch (err) {
    if (staleOnError && hit) return { value: hit.v, fresh: false, at: hit.t, hit: true };
    throw err;
  }
}

/** Test helper. */
export function _clearMemCache() {
  mem.clear();
  inflight.clear();
}
