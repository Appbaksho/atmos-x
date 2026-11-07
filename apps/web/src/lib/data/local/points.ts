/**
 * Points, levels, badges and the action-type table, ported from apps/mobile/src/lib/actions.ts and
 * kept in sync with `public.action_types` in apps/mobile/supabase/migrations/20261002000000_atmos_x.sql.
 *
 * Cooling coefficients are conservative order-of-magnitude estimates (°C for a 1 km² zone, per
 * unit): +1 % canopy per km² ≈ 0.1–0.2 °C (≈ 200 mature trees), cool roofs ≈ 0.04 °C per 1 % of a km².
 *
 * User-facing text is i18n codes: `action.<id>`, `unit.<id>`, `level.<slug>`, `badge.<id>`.
 */
import type { ActionType, ActionTypeId, Badge, Level, Period } from '../types';
import type { ActionLog, MyStats, TreeCheck } from './v0-types';

export const ACTION_TYPES: readonly ActionType[] = [
  { id: 'plant_tree', title_code: 'action.plant_tree', unit_code: 'unit.tree', emoji: '🌳', points: 50, cooling_per_unit: 0.0006, is_tree: true },
  { id: 'plant_shrubs', title_code: 'action.plant_shrubs', unit_code: 'unit.plants_10', emoji: '🪴', points: 12, cooling_per_unit: 0.0001, is_tree: false },
  { id: 'rooftop_garden', title_code: 'action.rooftop_garden', unit_code: 'unit.m2_10', emoji: '🏡', points: 40, cooling_per_unit: 0.0003, is_tree: false },
  { id: 'cool_roof', title_code: 'action.cool_roof', unit_code: 'unit.m2_10', emoji: '⬜', points: 30, cooling_per_unit: 0.0004, is_tree: false },
  { id: 'green_wall', title_code: 'action.green_wall', unit_code: 'unit.m2_5', emoji: '🌿', points: 20, cooling_per_unit: 0.00015, is_tree: false },
  { id: 'shade_structure', title_code: 'action.shade_structure', unit_code: 'unit.structure', emoji: '⛱️', points: 25, cooling_per_unit: 0.0002, is_tree: false },
  { id: 'water_tree', title_code: 'action.water_tree', unit_code: 'unit.session', emoji: '💧', points: 5, cooling_per_unit: 0, is_tree: false },
  { id: 'awareness', title_code: 'action.awareness', unit_code: 'unit.event', emoji: '📣', points: 30, cooling_per_unit: 0, is_tree: false },
];

export const ACTION_BY_ID: Record<ActionTypeId, ActionType> = Object.fromEntries(
  ACTION_TYPES.map((a) => [a.id, a]),
) as Record<ActionTypeId, ActionType>;

export const TREE_COOLING_PER_KM2 = ACTION_BY_ID.plant_tree.cooling_per_unit;
export const ROOF_COOLING_PER_KM2 = ACTION_BY_ID.cool_roof.cooling_per_unit;

/** Points for a 15-day tree photo check (same as one care session). */
export const TREE_CHECK_POINTS = ACTION_BY_ID.water_tree.points;

const MAX_QTY = 10000;
const qty = (q: number) => Math.max(1, Math.min(MAX_QTY, Math.round(q) || 1));

/** Same maths as the `score_action_log` trigger. */
export function scoreAction(action_type: ActionTypeId, quantity: number): { points: number; cooling_c: number; trees: number } {
  const t = ACTION_BY_ID[action_type];
  if (!t) throw new Error(`Unknown action type: ${action_type}`);
  const q = qty(quantity);
  return { points: t.points * q, cooling_c: +(t.cooling_per_unit * q).toFixed(6), trees: t.is_tree ? q : 0 };
}

/* ───────────────────────────── Levels ───────────────────────────── */

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

/* ───────────────────────────── Badges ───────────────────────────── */

export function badgesFor(stats: { trees: number; actions: number; points: number; clans: number }): Badge[] {
  return [
    { id: 'first', emoji: '🌱', code: 'badge.first', earned: stats.actions >= 1 },
    { id: 'trees10', emoji: '🌳', code: 'badge.trees10', earned: stats.trees >= 10 },
    { id: 'trees100', emoji: '🌲', code: 'badge.trees100', earned: stats.trees >= 100 },
    { id: 'clan', emoji: '🤝', code: 'badge.clan', earned: stats.clans >= 1 },
    { id: 'p1000', emoji: '🔥', code: 'badge.p1000', earned: stats.points >= 1000 },
    { id: 'streak', emoji: '⚡', code: 'badge.streak', earned: stats.actions >= 25 },
  ];
}

/* ───────────────────────────── Stats ───────────────────────────── */

/** Same windows as `public.period_start`: week = last 7 days, month = last 30 days. */
export function periodStart(period: Period, now: number = Date.now()): number {
  if (period === 'week') return now - 7 * 864e5;
  if (period === 'month') return now - 30 * 864e5;
  return -Infinity;
}

type Scored = Pick<ActionLog, 'points' | 'status' | 'created_at' | 'team_id' | 'trees' | 'cooling_c'>;

/** Verified points (pending = provisional, rejected = 0), optionally within a period / team. */
export function sumVerified(
  actions: readonly Scored[],
  opts: { period?: Period; team_id?: string | readonly string[]; now?: number } = {},
): { points: number; trees: number; cooling_c: number; actions: number } {
  const from = periodStart(opts.period ?? 'all', opts.now);
  const teams = opts.team_id === undefined ? null : Array.isArray(opts.team_id) ? opts.team_id : [opts.team_id];
  let points = 0;
  let trees = 0;
  let cooling = 0;
  let n = 0;
  for (const a of actions) {
    if (a.status !== 'verified') continue;
    if (new Date(a.created_at).getTime() < from) continue;
    if (teams && (!a.team_id || !teams.includes(a.team_id))) continue;
    points += a.points;
    trees += a.trees;
    cooling += a.cooling_c;
    n += 1;
  }
  return { points, trees, cooling_c: +cooling.toFixed(6), actions: n };
}

export function computeStats(input: {
  actions: readonly ActionLog[];
  checks?: readonly Pick<TreeCheck, 'points'>[];
  clans: number;
  rank_area?: number | null;
}): MyStats {
  const counted = input.actions.filter((a) => a.status !== 'rejected');
  const verified = sumVerified(input.actions);
  const checkPoints = (input.checks ?? []).reduce((s, c) => s + c.points, 0);
  const provisional = input.actions.filter((a) => a.status === 'pending').reduce((s, a) => s + a.points, 0);
  const points = verified.points + checkPoints;
  const trees = counted.reduce((s, a) => s + a.trees, 0);
  const actions = counted.length;
  return {
    points,
    provisional_points: provisional,
    level: levelFor(points),
    badges: badgesFor({ trees, actions, points, clans: input.clans }),
    trees,
    actions,
    cooling_c: +counted.reduce((s, a) => s + a.cooling_c, 0).toFixed(6),
    rank_area: input.rank_area ?? null,
  };
}
