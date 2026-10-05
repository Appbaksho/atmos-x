/**
 * Tiny key-value layer over IndexedDB (idb-keyval). Falls back to memory when IndexedDB is missing
 * (SSR, unit tests) or unusable (some private modes), so the app never crashes on storage.
 *
 * Keys are plain strings. Namespaced data uses `<ns>:<name>` (see ./store.ts); global data
 * (local accounts, session) uses `global:<name>`.
 */
import { createStore, del as idbDel, get as idbGet, keys as idbKeys, set as idbSet, type UseStore } from 'idb-keyval';

export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export function memoryKV(): KV {
  const m = new Map<string, unknown>();
  return {
    get: async <T,>(k: string) => m.get(k) as T | undefined,
    set: async (k, v) => void m.set(k, v),
    del: async (k) => void m.delete(k),
    keys: async () => [...m.keys()],
  };
}

function idbKV(store: UseStore): KV {
  return {
    get: <T,>(k: string) => idbGet<T>(k, store),
    set: (k, v) => idbSet(k, v, store),
    del: (k) => idbDel(k, store),
    keys: async () => (await idbKeys(store)).map(String),
  };
}

let kv: KV | null = null;
let probing: Promise<KV> | null = null;

async function probe(): Promise<KV> {
  if (typeof indexedDB === 'undefined') return memoryKV();
  try {
    const store = createStore('atmos-x-data', 'kv');
    const candidate = idbKV(store);
    await candidate.get('global:probe');
    return candidate;
  } catch {
    return memoryKV();
  }
}

/** The active store (IndexedDB in the browser, memory elsewhere). */
export async function getKV(): Promise<KV> {
  if (kv) return kv;
  probing ??= probe().then((k) => (kv = k));
  return probing;
}

/** Tests: swap in a fresh store. */
export function setKV(next: KV): void {
  kv = next;
  probing = null;
}

/* ─────────── per-key write lock (read-modify-write without lost updates) ─────────── */

const locks = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  locks.set(key, tail);
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return run;
}
