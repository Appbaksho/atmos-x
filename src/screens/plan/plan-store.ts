/**
 * Shared state for the Plan flow. In the prototype S08–S11 are one component, so the target,
 * timeline and planting map carry across screens; this tiny store keeps that behaviour across
 * the separate Expo Router screens (in memory, for the session).
 */
import { useSyncExternalStore } from 'react';

import { B } from '@/constants/cz';
import type { Fmt } from '@/lib/cz/format';

/** Target options (°C) and timeline options (years) with their goal dates. */
export const T4 = [-0.5, -1, -1.5, -2];
export const TL = [0.25, 1, 2, 5];
export const GD = ['2 Jan 2027', '2 Oct 2027', '2 Oct 2028', '2 Oct 2031'];

/** Suggested planting spots, % of the map. */
export const SPOTS: [number, number][] = [[19.8, 80.2], [32.1, 75.4], [44.4, 70.6], [56.7, 65.8], [69, 61], [81.3, 56.2], [34, 38], [66, 32]];
/** Zone outline, % of the map. */
export const ZONE_POLY: [number, number][] = [[8, 20], [50, 6], [92, 20], [92, 80], [50, 94], [8, 80]];

/** Plantable species on the map: colour, canopy fill, marker size (px), cooling per tree (°C), mature shade (m²). */
export const SPS = [
  { key: 'neem' as const, c: B.lime, fill: 'rgba(172,236,0,.35)', size: 30, cool: 0.025, shade: 50 },
  { key: 'krish' as const, c: B.orange, fill: 'rgba(242,154,56,.38)', size: 38, cool: 0.035, shade: 80 },
];

export type PlacedTree = { x: number; y: number; sp: number };

export type PlanState = {
  /** Target index into T4 */
  tgt: number;
  /** Timeline index into TL */
  tl: number;
  /** Species index into SPS used for the next placed tree */
  sp: number;
  trees: PlacedTree[];
};

let state: PlanState = {
  tgt: 2,
  tl: 1,
  sp: 0,
  trees: [
    { x: 32.1, y: 75.4, sp: 0 },
    { x: 44.4, y: 70.6, sp: 0 },
    { x: 56.7, y: 65.8, sp: 0 },
  ],
};
const subs = new Set<() => void>();

export function setPlan(patch: Partial<PlanState> | ((s: PlanState) => Partial<PlanState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  subs.forEach((fn) => fn());
}

const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
};
const snapshot = () => state;

export function usePlan(): PlanState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Point-in-polygon test against the zone outline. */
export function inZone(x: number, y: number) {
  const P = ZONE_POLY;
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i];
    const [xj, yj] = P[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Is a suggested spot already taken by a tree? */
export const spotTaken = (trees: PlacedTree[], x: number, y: number) => trees.some((p) => Math.hypot(p.x - x, p.y - y) < 3);

/** Fill every free suggested spot with the current species. */
export function autofill() {
  setPlan((s) => {
    const T = s.trees.slice();
    SPOTS.forEach(([x, y]) => {
      if (!T.some((p) => Math.hypot(p.x - x, p.y - y) < 7)) T.push({ x, y, sp: s.sp });
    });
    return { trees: T };
  });
}

/** "−1.5 °C · 2 Oct 2027" */
export function goalLine(f: Fmt, s: PlanState) {
  return f.dC(T4[s.tgt]) + ' · ' + f.loc(GD[s.tl]);
}
