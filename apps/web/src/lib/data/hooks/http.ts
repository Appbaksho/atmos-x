/** fetch helpers for the /api/v0 route handlers (V0_ROUTES). Same-origin cookies, typed errors. */
import { DataError, errorFromResponse } from '../errors';

export type Params = Record<string, string | number | boolean | null | undefined>;

/** `/api/v0/zones/[id]` + {id} → `/api/v0/zones/z-…` */
export function routePath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/\[(\w+)\]/g, (_, k: string) => encodeURIComponent(params[k] ?? ''));
}

export function withQuery(path: string, params: Params = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

async function toError(res: Response): Promise<DataError> {
  const err = await errorFromResponse(res);
  // A bare 404 (no JSON error body) means the route handler is not deployed yet.
  if (res.status === 404 && err.code === 'http_404') {
    return new DataError('server.not_available', 'This data is not available yet', 404);
  }
  return err;
}

export async function request(input: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, { credentials: 'same-origin', ...init });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new DataError('network.error', 'Network error: check your connection', 0);
  }
  if (!res.ok) throw await toError(res);
  return res;
}

export async function getJSON<T>(path: string, params?: Params, signal?: AbortSignal): Promise<T> {
  const res = await request(withQuery(path, params), { signal, headers: { accept: 'application/json' } });
  return (await res.json()) as T;
}

export async function postJSON<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await request(path, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

/** Retry once for network/5xx; never for 4xx (guest restricted, rate limited, validation, missing). */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof DataError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}
