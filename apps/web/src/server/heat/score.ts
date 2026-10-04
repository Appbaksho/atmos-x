import 'server-only';

import { gridDisk } from 'h3-js';

import { clamp, mean, median, quantile, round } from '../util';
import { HEAT } from './config';

/** Pure Heat Score maths (§5.1), unit-tested in score.test.ts. */

export type LandCover = { built: number; road: number; green: number; water: number; /** buildings per hectare */ density: number };

export function isNight(localHour: number): boolean {
  return localHour >= HEAT.nightFromHour || localHour < HEAT.nightToHour;
}

/** Land-cover contribution (°C) to the estimated surface temperature. */
export function landCoverTerm(lc: LandCover, night: boolean): number {
  const c = HEAT.coef;
  const t =
    c.built * lc.built + c.road * lc.road + c.green * lc.green + c.water * lc.water + c.density * Math.min(lc.density / HEAT.densityRef, 1);
  return night ? t * HEAT.nightFactor : t;
}

export function estSurfaceC(airC: number, lc: LandCover, night: boolean): number {
  return airC + landCoverTerm(lc, night);
}

export function heatScore(estC: number, medianEstC: number, lc: LandCover): number {
  const s = HEAT.score;
  return Math.round(clamp(0, 100, s.base + s.perDegree * (estC - medianEstC) + s.landCover * (lc.built + lc.road - lc.green)));
}

export type ScoredCell = LandCover & { h3: string; est_c: number; score: number };

/** Score every cell of a scan against the scan's median estimated temperature. */
export function scoreCells(cells: (LandCover & { h3: string })[], airC: number, night: boolean): { cells: ScoredCell[]; median_est_c: number } {
  const est = cells.map((c) => estSurfaceC(airC, c, night));
  const med = median(est);
  return {
    median_est_c: round(med, 2),
    cells: cells.map((c, i) => ({ ...c, est_c: round(est[i], 2), score: heatScore(est[i], med, c) })),
  };
}

/** Score after adding green cover (what-if), holding the scan median fixed. */
export function whatIfGreen(lc: LandCover, airC: number, medianEstC: number, night: boolean, addGreen = HEAT.whatIfGreen) {
  const before = estSurfaceC(airC, lc, night);
  const greener = { ...lc, green: Math.min(1, lc.green + addGreen) };
  const after = estSurfaceC(airC, greener, night);
  return { score_after: heatScore(after, medianEstC, greener), lst_drop_c: round(before - after, 2) };
}

export type Cluster = { cells: ScoredCell[]; score: number; est_c: number };

/**
 * Connected components (H3 neighbours) of the cells in the scan's top quartile, ranked by mean score.
 */
export function clusterHotCells(cells: ScoredCell[], q = HEAT.hotQuantile): Cluster[] {
  if (!cells.length) return [];
  const threshold = quantile(
    cells.map((c) => c.score),
    q,
  );
  const med = median(cells.map((c) => c.score));
  // Ties at the threshold only count when the threshold is above the median (flat scans have no zones).
  const hot = new Map(cells.filter((c) => c.score > threshold || (c.score === threshold && threshold > med)).map((c) => [c.h3, c]));
  const seen = new Set<string>();
  const clusters: Cluster[] = [];
  for (const start of hot.values()) {
    if (seen.has(start.h3)) continue;
    const members: ScoredCell[] = [];
    const stack = [start];
    seen.add(start.h3);
    while (stack.length) {
      const cur = stack.pop() as ScoredCell;
      members.push(cur);
      for (const n of gridDisk(cur.h3, 1)) {
        const nc = hot.get(n);
        if (nc && !seen.has(n)) {
          seen.add(n);
          stack.push(nc);
        }
      }
    }
    clusters.push({ cells: members, score: Math.round(mean(members.map((m) => m.score))), est_c: round(mean(members.map((m) => m.est_c)), 1) });
  }
  return clusters.sort((a, b) => b.score - a.score || b.cells.length - a.cells.length);
}

/** near_tie for each ranked item: a neighbouring rank's score differs by ≤ 3. */
export function nearTies(scores: number[], tol = HEAT.nearTie): boolean[] {
  return scores.map((s, i) => (i > 0 && Math.abs(s - scores[i - 1]) <= tol) || (i < scores.length - 1 && Math.abs(s - scores[i + 1]) <= tol));
}

/** Mean land cover of a set of cells. */
export function meanCover(cells: LandCover[]): LandCover {
  return {
    built: mean(cells.map((c) => c.built)),
    road: mean(cells.map((c) => c.road)),
    green: mean(cells.map((c) => c.green)),
    water: mean(cells.map((c) => c.water)),
    density: mean(cells.map((c) => c.density)),
  };
}
