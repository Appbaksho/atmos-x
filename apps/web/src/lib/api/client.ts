/**
 * Typed client for the FastAPI backend (prompt-v1 §3.1, §8.4). Same origin: Next rewrites
 * /api/v1/* and /media/* to API_ORIGIN, so session cookies are first-party.
 *
 * Types come from `make gen-client` (schema.d.ts, generated from FastAPI's OpenAPI document).
 * `call()` turns non-2xx replies into typed DataErrors (guest restricted, rate limited, …).
 */
import createClient from 'openapi-fetch';

import { DataError, GuestRestrictedError, RateLimitedError } from '@/lib/data/errors';

import type { components, paths } from './schema';

export type Schemas = components['schemas'];

export const api = createClient<paths>({
  baseUrl: typeof window === 'undefined' ? process.env.API_ORIGIN || 'http://localhost:8000' : '',
  credentials: 'same-origin',
  // The API rejects state-changing requests that are not JSON (CSRF guard).
  headers: { 'content-type': 'application/json', accept: 'application/json' },
});

type ErrBody = { code?: string; message?: string; fields?: Record<string, string>; retry_after?: number };

export class ApiFieldError extends DataError {
  fields: Record<string, string>;
  constructor(code: string, message: string, status: number, fields: Record<string, string>) {
    super(code, message, status);
    this.name = 'ApiFieldError';
    this.fields = fields;
  }
}

export function toDataError(status: number, body: unknown, retryAfterHeader?: string | null): DataError {
  const b = (body && typeof body === 'object' ? body : {}) as ErrBody;
  const code = b.code ?? `http_${status}`;
  const message = b.message ?? `HTTP ${status}`;
  if (status === 429) return new RateLimitedError(message, b.retry_after ?? (Number(retryAfterHeader) || null));
  if (code === 'auth.guest_restricted') return new GuestRestrictedError(message);
  if (b.fields) return new ApiFieldError(code, message, status, b.fields);
  return new DataError(code, message, status);
}

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Await an openapi-fetch call; return data or throw a DataError. */
export async function call<T>(p: Promise<Result<T>>): Promise<T> {
  let r: Result<T>;
  try {
    r = await p;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new DataError('network.error', 'Network error: check your connection', 0);
  }
  if (!r.response.ok) throw toDataError(r.response.status, r.error, r.response.headers.get('retry-after'));
  return r.data as T;
}

/** Multipart POST (photos, documents). openapi-fetch would force JSON, so use fetch directly. */
export async function postForm<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', body: form, credentials: 'same-origin', signal, headers: { accept: 'application/json' } });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new DataError('network.error', 'Network error: check your connection', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw toDataError(res.status, body, res.headers.get('retry-after'));
  return body as T;
}
