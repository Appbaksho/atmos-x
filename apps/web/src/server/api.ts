import 'server-only';

import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { LOCALES, type ApiError } from '@/lib/data/types';

import { UpstreamError } from './http';
import { errMsg } from './util';

/** Route-handler helpers: zod validation, `{ code, message }` errors and Cache-Control presets. */

export class HttpError extends Error {
  status: number;
  code: string;
  headers?: Record<string, string>;
  constructor(status: number, code: string, message: string, headers?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export const CACHE = {
  none: 'no-store',
  /** s = browser max-age, swr = stale-while-revalidate window */
  pub: (s: number, swr = s * 2) => `public, max-age=${s}, s-maxage=${s}, stale-while-revalidate=${swr}`,
  priv: (s: number) => `private, max-age=${s}`,
};

export function json<T>(data: T, opts: { status?: number; cache?: string; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(opts.headers);
  headers.set('Cache-Control', opts.cache ?? CACHE.none);
  return Response.json(data, { status: opts.status ?? 200, headers });
}

export function apiError(status: number, code: string, message: string, headers?: Record<string, string>): Response {
  const body: ApiError = { code, message };
  return json(body, { status, headers });
}

function issues(e: z.ZodError): string {
  return e.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
    .join('; ');
}

export function parseQuery<T extends z.ZodType>(req: NextRequest | Request, schema: T): z.infer<T> {
  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (v !== '') raw[k] = v;
  });
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, 'bad_request', issues(r.error));
  return r.data;
}

/** Parse a JSON body (≤ maxBytes) with a zod schema. */
export async function parseBody<T extends z.ZodType>(req: Request, schema: T, maxBytes = 6 * 1024 * 1024): Promise<z.infer<T>> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > maxBytes) throw new HttpError(413, 'payload_too_large', `Body larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > maxBytes) throw new HttpError(413, 'payload_too_large', 'Body too large');
    raw = JSON.parse(text);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'bad_request', 'Body must be JSON');
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, 'bad_request', issues(r.error));
  return r.data;
}

/** Wrap a handler: HttpError → its status; upstream failures → 502; anything else → 500. */
export function handler<C>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return apiError(e.status, e.code, e.message, e.headers);
      if (e instanceof UpstreamError) {
        console.warn(`[atmos] upstream error ${new URL(req.url).pathname}: ${e.message}`);
        return apiError(502, 'upstream_unavailable', 'A data source did not answer. Try again in a moment.');
      }
      console.error(`[atmos] ${new URL(req.url).pathname}:`, e);
      return apiError(500, 'internal', errMsg(e).slice(0, 200));
    }
  };
}

/* Shared zod pieces */
export const zLat = z.coerce.number().min(-90).max(90);
export const zLng = z.coerce.number().min(-180).max(180);
export const zLang = z.enum(LOCALES).default('en');
export const zRadius = z.coerce.number().int().min(100).max(1000).default(500);
export const zLatLng = z.object({ lat: zLat, lng: zLng });

/** data:image/(jpeg|png|webp);base64,… ≤ 4 MB decoded. */
export const zImage = z
  .string()
  .regex(/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/, 'image must be a JPEG, PNG or WebP data URL')
  .refine((s) => Math.floor(((s.length - s.indexOf(',') - 1) * 3) / 4) <= 4 * 1024 * 1024, 'image must be ≤ 4 MB');
