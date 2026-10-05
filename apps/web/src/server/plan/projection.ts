import 'server-only';

import type { I18nText, LatLng, Projection } from '@/lib/data/types';

import { makeMeta, SRC, src } from '../meta';
import { round } from '../util';
import { getArchive, summarize } from '../weather/archive';
import { roofCoolingC, shadeCoolingC, treeCoolingC, treeRamp } from './coeffs';

export const PROJECTION_END_YEAR = 2040;

export type ProjectionInput = { trees: number; roof_m2: number; shade: number };

/**
 * Pure projection maths (unit-tested): `without` follows the archive trend line from this year to
 * 2040; `with` subtracts the ramped tree cooling plus the immediate roof and shade cooling.
 */
export function projectLines(
  trend: { now_c: number; per_decade: number },
  areaKm2: number,
  input: ProjectionInput,
  startYear = new Date().getUTCFullYear(),
  endYear = PROJECTION_END_YEAR,
): { years: number[]; without_c: number[]; with_c: number[] } {
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  const without_c = years.map((y) => round(trend.now_c + (trend.per_decade / 10) * (y - startYear), 2));
  const roofAndShade = input.roof_m2 * roofCoolingC(areaKm2) + input.shade * shadeCoolingC(areaKm2);
  const with_c = years.map((y, i) => {
    const t = y - startYear;
    const cooling = input.trees * treeCoolingC(areaKm2) * treeRamp(t) + (t >= 1 ? roofAndShade : 0);
    return round(without_c[i] - cooling, 2);
  });
  return { years, without_c, with_c };
}

export async function getProjection(centroid: LatLng, areaKm2: number, input: ProjectionInput): Promise<Projection> {
  const ar = await getArchive(centroid);
  const s = summarize(ar.data);
  const lines = projectLines({ now_c: s.trend_now_c, per_decade: s.trend_c_per_decade }, areaKm2, input);
  const assumptions: I18nText[] = [
    { code: 'assumption.trend', params: { per_decade: s.trend_c_per_decade, from: s.years[0], to: s.years[1] } },
    { code: 'assumption.hot_season', params: { months: s.hot_months.join(', ') } },
    { code: 'assumption.tree_ramp' },
    { code: 'assumption.tree_cooling', params: { per_100_trees: round(100 * treeCoolingC(areaKm2), 2), area_km2: round(areaKm2, 2) } },
    { code: 'assumption.roof_cooling', params: { per_1000_m2: round(1000 * roofCoolingC(areaKm2), 2) } },
    { code: 'assumption.inputs', params: { trees: input.trees, roof_m2: input.roof_m2, shade: input.shade } },
    { code: 'assumption.ranges' },
  ];
  return { ...lines, assumptions, meta: makeMeta(ar.live, [src(SRC.archive, ar.data.end), SRC.model]) };
}
