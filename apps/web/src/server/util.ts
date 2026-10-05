import 'server-only';

import type { LatLng } from '@/lib/data/types';

import { env } from './env';

const R_EARTH_M = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.sqrt(s));
}

export const round = (n: number, d = 1) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

export const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Quantile with linear interpolation (q in 0..1). */
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Round lat/lng to a grid cell for cache keys (default 0.01° ≈ 1.1 km). */
export function cellKey(lat: number, lng: number, step = 0.01): string {
  const d = Math.max(0, -Math.floor(Math.log10(step)));
  return `${(Math.round(lat / step) * step).toFixed(d)},${(Math.round(lng / step) * step).toFixed(d)}`;
}

/** Bounding box [south, west, north, east] of a circle. */
export function bboxAround(c: LatLng, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.2, Math.cos(toRad(c.lat))));
  return [c.lat - dLat, c.lng - dLng, c.lat + dLat, c.lng + dLng];
}

/** Is the point within `km` of the demo point (the snapshot fallback area)? */
export function nearDemo(p: LatLng, km = 5): boolean {
  return haversineM(p, env.demo) <= km * 1000;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Timing log, e.g. `[atmos] zones.scan 523ms cold`. */
export function logTiming(label: string, startMs: number, extra = ''): number {
  const ms = Math.round(performance.now() - startMs);
  if (env.log) console.info(`[atmos] ${label} ${ms}ms${extra ? ' ' + extra : ''}`);
  return ms;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
