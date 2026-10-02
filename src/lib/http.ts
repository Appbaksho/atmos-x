import 'expo-sqlite/localStorage/install';

/** fetch() with a timeout and JSON parsing. */
export async function getJSON<T = any>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 25000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      headers: { Accept: 'application/json', ...(rest.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 160)}`);
    }
    return (await res.json()) as T;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Request timed out. Check your connection.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

type CacheEntry<T> = { t: number; v: T };

/** Tiny persistent cache backed by expo-sqlite's localStorage. */
export const cache = {
  get<T>(key: string, maxAgeMs: number): T | null {
    try {
      const raw = localStorage.getItem(`ax:${key}`);
      if (!raw) return null;
      const e = JSON.parse(raw) as CacheEntry<T>;
      if (Date.now() - e.t > maxAgeMs) return null;
      return e.v;
    } catch {
      return null;
    }
  },
  set<T>(key: string, v: T) {
    try {
      localStorage.setItem(`ax:${key}`, JSON.stringify({ t: Date.now(), v }));
    } catch {
      // storage full or unavailable: ignore
    }
  },
};

export async function cached<T>(key: string, maxAgeMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get<T>(key, maxAgeMs);
  if (hit != null) return hit;
  const v = await fn();
  cache.set(key, v);
  return v;
}

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;
