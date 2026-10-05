import 'server-only';

import type { BmdLevel, LatLng } from '@/lib/data/types';

/**
 * Bangladesh Meteorological Department heat-wave bands, applied by us to the forecast maximum.
 * Always labelled "based on BMD thresholds, not an official warning".
 * mild 36–37.9 · moderate 38–39.9 · severe 40–41.9 · very severe ≥ 42 °C
 */
export function bmdLevel(tmaxC: number): BmdLevel | null {
  if (tmaxC >= 42) return 'very_severe';
  if (tmaxC >= 40) return 'severe';
  if (tmaxC >= 38) return 'moderate';
  if (tmaxC >= 36) return 'mild';
  return null;
}

export const BMD_ORDER: Record<BmdLevel, number> = { mild: 1, moderate: 2, severe: 3, very_severe: 4 };

/** Simplified outline of Bangladesh (lng, lat), ~10 km accuracy: enough to decide if BMD bands apply. */
const BD_POLYGON: [number, number][] = [
  [88.01, 24.3], [88.15, 24.85], [88.45, 25.2], [88.08, 25.82], [88.25, 26.4], [88.52, 26.37],
  [89.05, 26.39], [89.36, 26.0], [89.85, 25.29], [90.4, 25.15], [91.2, 25.2], [92.0, 25.2],
  [92.4, 24.95], [92.2, 24.6], [92.1, 24.2], [91.9, 24.15], [91.75, 23.7], [91.62, 23.15],
  [91.85, 23.3], [92.0, 23.55], [92.3, 23.65], [92.39, 23.0], [92.6, 22.1], [92.68, 21.3],
  [92.3, 20.6], [92.0, 21.1], [91.8, 22.1], [91.4, 22.7], [90.6, 22.1], [90.3, 21.8],
  [89.85, 21.7], [89.0, 21.6], [88.95, 22.05], [89.05, 22.9], [88.75, 23.3], [88.55, 23.65],
  [88.7, 24.05], [88.3, 24.3], [88.01, 24.3],
];

export function inBangladesh(p: LatLng): boolean {
  if (p.lat < 20.5 || p.lat > 26.7 || p.lng < 88.0 || p.lng > 92.7) return false;
  let inside = false;
  for (let i = 0, j = BD_POLYGON.length - 1; i < BD_POLYGON.length; j = i++) {
    const [xi, yi] = BD_POLYGON[i];
    const [xj, yj] = BD_POLYGON[j];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
