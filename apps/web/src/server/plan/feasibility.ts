import 'server-only';

import type { Feasibility, I18nText } from '@/lib/data/types';

import { round } from '../util';
import { roofCoolingC, shadeCoolingC, treeCoolingC } from './coeffs';

/** Pure plan maths (§5.3), unit-tested. */

export const SAPLING_M2 = 25;
export const ROADSIDE_SPACING_M = 8;
export const ROOF_USABLE = 0.6;
export const TREE_SHARE = 0.7;

export type Space = { ground_m2: number; roof_m2: number; roadside_m: number };

export function capacity(space: Space) {
  return {
    trees: Math.floor(space.ground_m2 / SAPLING_M2 + space.roadside_m / ROADSIDE_SPACING_M),
    roof_m2: Math.floor(space.roof_m2 * ROOF_USABLE),
  };
}

export type Mix = { trees: number; roof_m2: number; shade: number; cooling_c: number };

/**
 * Port of planForZone: split the target 70/30 between trees and cool roofs, then shift work to
 * whichever has space left when one side runs out. Shade structures: 1 per 0.1 km² (min 1).
 */
export function planMix(targetC: number, areaKm2: number, space: Space | null): Mix & { needed: { trees: number; roof_m2: number; shade: number } } {
  const target = Math.max(0.1, Math.abs(targetC));
  const tC = treeCoolingC(areaKm2);
  const rC = roofCoolingC(areaKm2);
  const shade = Math.max(1, Math.round(areaKm2 / 0.1));
  const rest = Math.max(0, target - shade * shadeCoolingC(areaKm2));
  let trees = Math.ceil((rest * TREE_SHARE) / tC);
  let roof = Math.ceil(((rest * (1 - TREE_SHARE)) / rC) / 10) * 10;
  const needed = { trees, roof_m2: roof, shade };
  if (space) {
    const cap = capacity(space);
    if (trees > cap.trees && roof < cap.roof_m2) {
      const missing = (trees - cap.trees) * tC;
      trees = cap.trees;
      roof = Math.ceil((roof + missing / rC) / 10) * 10;
    } else if (roof > cap.roof_m2 && trees < cap.trees) {
      const missing = (roof - cap.roof_m2) * rC;
      roof = Math.floor(cap.roof_m2 / 10) * 10;
      trees = Math.ceil(trees + missing / tC);
    }
  }
  const cooling_c = round(trees * tC + roof * rC + shade * shadeCoolingC(areaKm2), 2);
  return { trees, roof_m2: roof, shade, cooling_c, needed };
}

export function feasibility(targetC: number, areaKm2: number, space: Space | null, monthsToGoal: number): Feasibility & { mix: Mix } {
  const mix = planMix(targetC, areaKm2, space);
  const notes: I18nText[] = [];
  let verdict: Feasibility['feasible'] = 'stretch';
  if (space) {
    const cap = capacity(space);
    const k = Math.max(cap.trees ? mix.trees / cap.trees : Infinity, cap.roof_m2 ? mix.roof_m2 / cap.roof_m2 : mix.roof_m2 ? Infinity : 0);
    verdict = k <= 0.6 ? 'yes' : k <= 1 ? 'stretch' : 'no';
    notes.push({ code: 'feas.trees_vs_space', params: { trees: mix.trees, capacity: cap.trees } });
    notes.push({ code: 'feas.roofs_vs_space', params: { roof_m2: mix.roof_m2, capacity_m2: cap.roof_m2 } });
    if (verdict === 'no') {
      const maxC = round(cap.trees * treeCoolingC(areaKm2) + cap.roof_m2 * roofCoolingC(areaKm2) + mix.shade * shadeCoolingC(areaKm2), 1);
      notes.push({ code: 'feas.max_cooling', params: { max_c: maxC } });
    }
  } else {
    notes.push({ code: 'feas.spots_unknown' });
  }
  if (monthsToGoal < 6) notes.push({ code: 'feas.action_goal' });
  if (monthsToGoal < 36 && mix.trees > 0) notes.push({ code: 'feas.trees_take_years' });
  return {
    feasible: verdict,
    needed: { trees: mix.trees, roof_m2: mix.roof_m2, shade: mix.shade },
    spots_available: { ground_m2: space?.ground_m2 ?? 0, roof_m2: space?.roof_m2 ?? 0 },
    notes,
    mix,
  };
}
