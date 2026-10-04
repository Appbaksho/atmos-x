import 'server-only';

import type { NextRequest } from 'next/server';

import { HttpError } from './api';

/**
 * Per-device limits (prompt-v0.md §4.6), kept in memory. The device is the anonymous
 * `atmos_device` cookie set by src/proxy.ts; if it is missing we mint one here and the handler
 * sets it on the response.
 */

export const DEVICE_COOKIE = 'atmos_device';

export const LIMITS = {
  askGuest: 5,
  askUser: 30,
  /** Hard server cap whatever the client claims */
  askHard: 30,
  photoPerDay: 20,
  scansPerHour: 30,
} as const;

export type Device = { id: string; isNew: boolean };

export function deviceOf(req: NextRequest): Device {
  const v = req.cookies.get(DEVICE_COOKIE)?.value;
  if (v && /^[A-Za-z0-9_-]{8,64}$/.test(v)) return { id: v, isNew: false };
  return { id: crypto.randomUUID().replace(/-/g, ''), isNew: true };
}

export function deviceCookie(dev: Device): Record<string, string> {
  if (!dev.isNew) return {};
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return { 'Set-Cookie': `${DEVICE_COOKIE}=${dev.id}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${secure}` };
}

type Counter = { window: string; n: number };
const counters = new Map<string, Counter>();

const dayWindow = () => new Date().toISOString().slice(0, 10);
const hourWindow = () => new Date().toISOString().slice(0, 13);

function bump(key: string, window: string, limit: number, consume: boolean): { ok: boolean; used: number; remaining: number } {
  const c = counters.get(key);
  const cur = c && c.window === window ? c : { window, n: 0 };
  if (cur.n >= limit) return { ok: false, used: cur.n, remaining: 0 };
  if (consume) {
    cur.n++;
    counters.set(key, cur);
  }
  return { ok: true, used: cur.n, remaining: limit - cur.n };
}

export function askLimit(profile: 'guest' | 'user' | undefined): number {
  return Math.min(profile === 'user' ? LIMITS.askUser : LIMITS.askGuest, LIMITS.askHard);
}

/** Count one Ask message. Throws 429 when the device is over its daily limit. */
export function takeAsk(dev: Device, profile: 'guest' | 'user' | undefined): { remaining: number; limit: number } {
  const limit = askLimit(profile);
  // One counter per device; a guest who registers keeps their used count.
  const r = bump(`ask:${dev.id}`, dayWindow(), limit, true);
  if (!r.ok) throw new HttpError(429, 'rate_limited', `Daily Ask Atmos limit reached (${limit}/day).`, { 'Retry-After': String(secondsToMidnightUtc()), ...deviceCookie(dev) });
  return { remaining: r.remaining, limit };
}

export function takePhotoCheck(dev: Device): number {
  const r = bump(`photo:${dev.id}`, dayWindow(), LIMITS.photoPerDay, true);
  if (!r.ok) throw new HttpError(429, 'rate_limited', `Daily photo-check limit reached (${LIMITS.photoPerDay}/day).`, { 'Retry-After': String(secondsToMidnightUtc()), ...deviceCookie(dev) });
  return r.remaining;
}

/** Count one cold scan (an Overpass call). Warm scans are free. */
export function takeScan(dev: Device): number {
  const r = bump(`scan:${dev.id}`, hourWindow(), LIMITS.scansPerHour, true);
  if (!r.ok) throw new HttpError(429, 'rate_limited', `Scan limit reached (${LIMITS.scansPerHour}/hour).`, { 'Retry-After': '600', ...deviceCookie(dev) });
  return r.remaining;
}

function secondsToMidnightUtc(): number {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.round((next - now.getTime()) / 1000));
}

/** Test helper. */
export function _resetLimits() {
  counters.clear();
}
