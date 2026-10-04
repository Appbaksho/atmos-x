/**
 * Display helpers for action types (icons, quantity units, how fast they cool). Titles live in the
 * `act` namespace: t(`type.${id}`), short labels t(`short.${id}`), units t(`unit.${unit}`).
 */
import { I } from '@/components/cz';
import type { ActionTypeId } from '@/lib/data/types';

const SHADE = 'M3 9l18-4-5 11zM10 13v8';
const MEGAPHONE = 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12';
const SHRUB = 'M12 21v-6M7 15h10l-1.5 6h-7zM12 15c-4 0-6-3-5-7 3 0 5 2 5 5 0-3 2-5 5-5 1 4-1 7-5 7z';

export const ACTION_ORDER: ActionTypeId[] = ['plant_tree', 'cool_roof', 'green_wall', 'water_tree', 'plant_shrubs', 'rooftop_garden', 'shade_structure', 'awareness'];

export const ACTION_ICON: Record<ActionTypeId, string> = {
  plant_tree: I.tree,
  plant_shrubs: SHRUB,
  rooftop_garden: I.roof,
  cool_roof: I.roof,
  green_wall: I.climber,
  shade_structure: SHADE,
  water_tree: I.drop,
  awareness: MEGAPHONE,
};

/** How long until the action starts to cool (plan.effect* keys). */
export const EFFECT_KEY: Record<ActionTypeId, 'effectWeek' | 'effectYears' | 'effectMonths' | null> = {
  plant_tree: 'effectYears',
  plant_shrubs: 'effectMonths',
  rooftop_garden: 'effectMonths',
  cool_roof: 'effectWeek',
  green_wall: 'effectMonths',
  shade_structure: 'effectWeek',
  water_tree: null,
  awareness: null,
};

/** m² per unit for area-based actions (quantity is counted in these units). */
export const UNIT_M2: Partial<Record<ActionTypeId, number>> = { cool_roof: 10, rooftop_garden: 10, green_wall: 5 };

/** Quantity text, e.g. "3 trees", "40 m²". `tu` = useTranslations('act.unit'). */
export function qtyText(tu: (k: string, p?: Record<string, string | number>) => string, unitCode: string, qty: number, loc: (n: number) => string): string {
  const unit = unitCode.replace(/^unit\./, '');
  if (unit === 'm2_10') return tu('m2_10', { m2: loc(qty * 10) });
  if (unit === 'm2_5') return tu('m2_5', { m2: loc(qty * 5) });
  return tu(unit, { n: qty });
}
