/**
 * Action-type catalog for the log-action screen (icons, units, the points preview) and levels. The
 * server computes the real points (prompt-v1 §6.7); these values mirror `action_types` there.
 * Cooling coefficients are conservative estimates (°C for a 1 km² zone, per unit).
 * User-facing text is i18n codes: `action.<id>`, `unit.<id>`, `level.<slug>`.
 */
import type { ActionType, ActionTypeId, Level } from '../types';

/** `points_per`: units per award (cool roof: 30 points per 10 units of 10 m², i.e. per 100 m²). */
export const ACTION_TYPES: readonly (ActionType & { points_per: number })[] = [
  { id: 'plant_tree', title_code: 'action.plant_tree', unit_code: 'unit.tree', emoji: '🌳', points: 50, points_per: 1, cooling_per_unit: 0.0006, is_tree: true },
  { id: 'plant_shrubs', title_code: 'action.plant_shrubs', unit_code: 'unit.plants_10', emoji: '🪴', points: 12, points_per: 1, cooling_per_unit: 0.0001, is_tree: false },
  { id: 'rooftop_garden', title_code: 'action.rooftop_garden', unit_code: 'unit.m2_10', emoji: '🏡', points: 40, points_per: 1, cooling_per_unit: 0.0003, is_tree: false },
  { id: 'cool_roof', title_code: 'action.cool_roof', unit_code: 'unit.m2_10', emoji: '⬜', points: 30, points_per: 10, cooling_per_unit: 0.0004, is_tree: false },
  { id: 'green_wall', title_code: 'action.green_wall', unit_code: 'unit.m2_5', emoji: '🌿', points: 20, points_per: 1, cooling_per_unit: 0.00015, is_tree: false },
  { id: 'shade_structure', title_code: 'action.shade_structure', unit_code: 'unit.structure', emoji: '⛱️', points: 25, points_per: 1, cooling_per_unit: 0.0002, is_tree: false },
  { id: 'water_tree', title_code: 'action.water_tree', unit_code: 'unit.session', emoji: '💧', points: 5, points_per: 1, cooling_per_unit: 0, is_tree: false },
  { id: 'awareness', title_code: 'action.awareness', unit_code: 'unit.event', emoji: '📣', points: 30, points_per: 1, cooling_per_unit: 0, is_tree: false },
];

export const ACTION_BY_ID = Object.fromEntries(ACTION_TYPES.map((a) => [a.id, a])) as Record<ActionTypeId, ActionType & { points_per: number }>;

export const TREE_COOLING_PER_KM2 = ACTION_BY_ID.plant_tree.cooling_per_unit;
export const ROOF_COOLING_PER_KM2 = ACTION_BY_ID.cool_roof.cooling_per_unit;

const MAX_QTY = 10000;
const qty = (q: number) => Math.max(1, Math.min(MAX_QTY, Math.round(q) || 1));

/** Preview of what the server will award once the action is verified. */
export function scoreAction(action_type: ActionTypeId, quantity: number): { points: number; cooling_c: number; trees: number } {
  const t = ACTION_BY_ID[action_type];
  if (!t) throw new Error(`Unknown action type: ${action_type}`);
  const q = qty(quantity);
  return { points: t.points * Math.floor(q / t.points_per), cooling_c: +(t.cooling_per_unit * q).toFixed(6), trees: t.is_tree ? q : 0 };
}

export const LEVELS = [
  { slug: 'seedling', min: 0 },
  { slug: 'sapling', min: 200 },
  { slug: 'shade_maker', min: 600 },
  { slug: 'canopy_keeper', min: 1500 },
  { slug: 'heat_breaker', min: 4000 },
  { slug: 'climate_guardian', min: 10000 },
] as const;

export function levelFor(points: number): Level {
  let idx = 0;
  LEVELS.forEach((l, i) => {
    if (points >= l.min) idx = i;
  });
  return { level: idx + 1, name_code: `level.${LEVELS[idx].slug}`, min: LEVELS[idx].min, next: LEVELS[idx + 1]?.min ?? null };
}
