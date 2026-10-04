import 'server-only';

/**
 * Heat proxy v0 coefficients (prompt-v0.md §5.1). These are configuration, not measurements:
 *   est_c = air_c + 9·built + 7·road − 6·green − 8·water + 1.5·min(building_density/40, 1)
 * where the fractions are shares of a hex cell's area, building_density is buildings per hectare,
 * and at night (local 19:00–06:00) every land-cover term is multiplied by 0.4.
 *   score = clamp(0, 100, 50 + 8·(est_c − median est_c of the scan) + 20·(built + road − green))
 */
export const HEAT = {
  coef: { built: 9, road: 7, green: -6, water: -8, density: 1.5 },
  densityRef: 40,
  nightFactor: 0.4,
  nightFromHour: 19,
  nightToHour: 6,
  score: { base: 50, perDegree: 8, landCover: 20 },
  /** Cells sampled on a 6×6 grid over the hex's bounding box (points outside the hex are dropped). */
  samplesPerSide: 6,
  /** Each `natural=tree` node counts as this much canopy (m²). */
  treeCanopyM2: 25,
  /** Overpass query covers the scan circle plus this buffer (m). */
  bufferM: 300,
  /** Road half-widths (m) from the full buffered widths per highway class. */
  roadWidthM: {
    motorway: 12,
    trunk: 12,
    motorway_link: 12,
    trunk_link: 12,
    primary: 10,
    primary_link: 10,
    secondary: 8,
    secondary_link: 8,
    tertiary: 7,
    tertiary_link: 7,
    residential: 5,
    living_street: 5,
    unclassified: 5,
  } as Record<string, number>,
  roadWidthDefaultM: 3,
  /** Non-road highway values that should not count as sealed road surface. */
  roadIgnore: new Set(['footway', 'path', 'steps', 'cycleway', 'bridleway', 'track', 'corridor', 'proposed', 'construction', 'platform', 'elevator', 'via_ferrata']),
  /** Green that fills a cell sample point when the point is inside these line features (m half-width). */
  treeRowHalfWidthM: 3,
  /** Assumed share of dark (non-reflective) roofs per country; flagged as an estimate. */
  darkRoofPct: { BD: 64, IN: 60, PK: 60, default: 50 } as Record<string, number>,
  /** Zones: cells at or above this quantile of the scan's scores, clustered by H3 adjacency. */
  hotQuantile: 0.75,
  nearTie: 3,
  maxZones: 12,
  whatIfGreen: 0.1,
} as const;

/** H3 resolution: 11 for scans ≤ 300 m, else 10. */
export function h3ResFor(radiusM: number): number {
  return radiusM <= 300 ? 11 : 10;
}

/** Radius bucket used in zone ids and cache keys (nearest 100 m, 100–1000). */
export function radiusBucket(radiusM: number): number {
  return Math.min(1000, Math.max(100, Math.round(radiusM / 100) * 100));
}
