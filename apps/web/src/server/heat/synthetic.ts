import 'server-only';

import { cellToLatLng } from 'h3-js';

import type { LatLng } from '@/lib/data/types';

import { clamp, round } from '../util';
import type { CellCover } from './landcover';
import { projector } from './landcover';

/**
 * Last-resort synthetic heat field (port of apps/mobile/src/lib/cz/hex.ts): a few gaussian hot
 * and cool spots over a gently noisy base, laid on real H3 cells around the point. Responses built
 * from it carry `meta.live = false` and `scan.method = 'synthetic'`.
 */

type Spot = [x: number, y: number, width: number, amplitude: number];

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function syntheticCover(center: LatLng, radiusM: number, cells: string[]): CellCover[] {
  const rnd = seeded(Math.round(center.lat * 1e4) * 31 + Math.round(center.lng * 1e4));
  const proj = projector(center);
  const spot = (amp: number): Spot => [(rnd() - 0.5) * radiusM * 1.4, (rnd() - 0.5) * radiusM * 1.4, radiusM * (0.15 + rnd() * 0.2), amp];
  const hot: Spot[] = [spot(34), spot(26), spot(18)];
  const cool: Spot[] = [spot(22), spot(14)];
  return cells.map((h) => {
    const [lat, lng] = cellToLatLng(h);
    const [x, y] = proj.to(lat, lng);
    let s = 48 + 6 * Math.sin(x / 90 + y / 160);
    for (const [hx, hy, w, a] of hot) s += a * Math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * w * w));
    for (const [hx, hy, w, a] of cool) s -= a * Math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * w * w));
    s = clamp(12, 96, s) / 100;
    const built = clamp(0, 0.85, s * 0.75);
    const road = clamp(0, 0.3, 0.06 + s * 0.12);
    const green = clamp(0, 1 - built - road, (1 - s) * 0.45);
    return { h3: h, lat: round(lat, 6), lng: round(lng, 6), built: round(built, 3), road: round(road, 3), green: round(green, 3), water: 0, density: round(s * 45, 1), buildings: 0, trees: 0 };
  });
}
