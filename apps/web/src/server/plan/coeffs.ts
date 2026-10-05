import 'server-only';

import type { ActionTypeId } from '@/lib/data/types';

/**
 * Cooling coefficients, ported from apps/mobile/src/lib/actions.ts (conservative, order-of-magnitude
 * values from urban-heat literature):
 *  - +1 % tree canopy in 1 km² lowers daytime surface temperature by ~0.1–0.2 °C (Ziter et al. 2019;
 *    Schwaab et al. 2021). One mature street tree ≈ 50 m² crown, so 200 trees ≈ 1 % of a km² → ~0.12 °C,
 *    i.e. 0.0006 °C per tree per km².
 *  - Cool / white roofs: ~0.04 °C per 1 % of a km² (Santamouris 2014), i.e. 0.0004 °C per 10 m² per km².
 * A zone's cooling = coefficient / zone area (km²), with the area floored at 0.1 km² because the
 * literature values are neighbourhood-scale.
 */
export const COOLING_PER_KM2: Record<ActionTypeId, number> = {
  plant_tree: 0.0006,
  plant_shrubs: 0.0001,
  rooftop_garden: 0.0003,
  cool_roof: 0.0004,
  green_wall: 0.00015,
  shade_structure: 0.0002,
  water_tree: 0,
  awareness: 0,
};

/** Units of each action type (cool_roof and rooftop_garden are per 10 m²). */
export const UNIT_M2: Partial<Record<ActionTypeId, number>> = { cool_roof: 10, rooftop_garden: 10, green_wall: 5 };

export const MIN_AREA_KM2 = 0.1;

export const effArea = (areaKm2: number) => Math.max(MIN_AREA_KM2, areaKm2);

/** °C per tree at maturity for a zone of `areaKm2`. */
export const treeCoolingC = (areaKm2: number) => COOLING_PER_KM2.plant_tree / effArea(areaKm2);
/** °C per m² of cool roof. */
export const roofCoolingC = (areaKm2: number) => COOLING_PER_KM2.cool_roof / 10 / effArea(areaKm2);
/** °C per shade structure. */
export const shadeCoolingC = (areaKm2: number) => COOLING_PER_KM2.shade_structure / effArea(areaKm2);

/** Tree cooling ramps with growth: 20 % in year 1, 50 % in year 3, 80 % in year 5, 100 % from year 8. */
const RAMP: [number, number][] = [
  [0, 0],
  [1, 0.2],
  [3, 0.5],
  [5, 0.8],
  [8, 1],
];

export function treeRamp(yearsSincePlanting: number): number {
  const t = yearsSincePlanting;
  if (t <= 0) return 0;
  if (t >= 8) return 1;
  for (let i = 1; i < RAMP.length; i++) {
    const [x1, y1] = RAMP[i];
    const [x0, y0] = RAMP[i - 1];
    if (t <= x1) return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 1;
}
