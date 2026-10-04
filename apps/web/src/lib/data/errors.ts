/**
 * Typed data-layer errors. Hooks throw these; the UI maps them:
 * - GuestRestrictedError → requireAccount() sheet (V0-1)
 * - RateLimitedError → "limit reached" toast
 * - DataError → ErrorState with retry
 */
import type { ApiError } from './types';

export class DataError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = 'DataError';
    this.code = code;
    this.status = status;
  }
}

export class GuestRestrictedError extends DataError {
  constructor(feature: string) {
    super('auth.guest_restricted', `Create a free account to use: ${feature}`, 403);
    this.name = 'GuestRestrictedError';
  }
}

export class RateLimitedError extends DataError {
  retryAfter: number | null;
  constructor(message = 'Too many requests', retryAfter: number | null = null) {
    super('rate_limited', message, 429);
    this.name = 'RateLimitedError';
    this.retryAfter = retryAfter;
  }
}

export function isGuestRestricted(e: unknown): e is GuestRestrictedError {
  return e instanceof DataError && e.code === 'auth.guest_restricted';
}

/** Convert a non-2xx fetch response into a typed error. */
export async function errorFromResponse(res: Response): Promise<DataError> {
  let body: Partial<ApiError> = {};
  try {
    body = (await res.json()) as Partial<ApiError>;
  } catch {
    // non-JSON error body
  }
  const code = body.code ?? `http_${res.status}`;
  const message = body.message ?? res.statusText;
  if (res.status === 429) return new RateLimitedError(message, Number(res.headers.get('retry-after')) || null);
  if (code === 'auth.guest_restricted') return new GuestRestrictedError(message);
  return new DataError(code, message, res.status);
}
