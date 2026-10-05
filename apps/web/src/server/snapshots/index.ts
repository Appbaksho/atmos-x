import 'server-only';

import type { LatLng } from '@/lib/data/types';

import { env } from '../env';
import { haversineM } from '../util';
import { SNAPSHOTS } from './dhaka';

/**
 * Recorded responses for the Dhaka demo point (prompt-v0.md §5.6), written by
 * `npm run snapshot:dhaka`. Modules fall back to these when a live call fails and the request is
 * near the demo point; the response then carries `meta.live = false`.
 */
export function snapshot<T>(name: string, p: LatLng | null, maxKm = 5): T | null {
  if (p && haversineM(p, env.demo) > maxKm * 1000) return null;
  const v = SNAPSHOTS[name];
  return v === undefined ? null : (structuredClone(v) as T);
}

export function snapshotNames(): string[] {
  return Object.keys(SNAPSHOTS);
}
