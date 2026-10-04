/** Cooling goals (local in v0). Progress = modeled cooling from verified actions ÷ target. */
import { DEMO_NAMESPACE } from '../seed';
import type { Goal, LatLng, ZonesScan } from '../types';
import type { DataContext } from './context';
import { assertAccount } from './guest';
import { newId } from './ids';
import { COLL, readList, updateList, type LocalGoal, type Namespace } from './store';

export const MILESTONES = [25, 50, 75, 100] as const;
/** Smallest zone area used for cooling maths, km² (avoids huge numbers for tiny zones). */
export const MIN_ZONE_AREA_KM2 = 0.05;

/** Average H3 cell areas (km²) for the resolutions the scan uses. */
const H3_AREA_KM2: Record<number, number> = { 8: 0.737327598, 9: 0.105332513, 10: 0.015047502, 11: 0.002149643, 12: 0.000307092 };

/** H3 resolution from the index string (bits 52–55), without loading h3-js. */
export function h3Resolution(cell: string): number | null {
  try {
    return Number((BigInt(`0x${cell}`) >> BigInt(52)) & BigInt(0xf));
  } catch {
    return null;
  }
}

export function zoneAreaKm2(h3: readonly string[] | undefined, fallback = MIN_ZONE_AREA_KM2): number {
  if (!h3?.length) return fallback;
  const area = h3.reduce((s, c) => s + (H3_AREA_KM2[h3Resolution(c) ?? -1] ?? 0), 0);
  return Math.max(MIN_ZONE_AREA_KM2, +area.toFixed(4));
}

export function progressPct(modeled_c: number, target_c: number): number {
  if (!target_c) return 0;
  return Math.max(0, Math.min(100, Math.round((modeled_c / target_c) * 100)));
}

export function milestonesCrossed(prevPct: number, nextPct: number): number[] {
  return MILESTONES.filter((m) => prevPct < m && nextPct >= m);
}

/** Apply an action's cooling (°C per km²) to a goal. Returns the new goal + milestones crossed. */
export function applyCooling(goal: LocalGoal, cooling_c_per_km2: number): { goal: LocalGoal; crossed: number[] } {
  const area = Math.max(MIN_ZONE_AREA_KM2, goal.zone_area_km2 || MIN_ZONE_AREA_KM2);
  const modeled_c = +(goal.modeled_c - cooling_c_per_km2 / area).toFixed(4);
  const pct = Math.max(goal.progress_pct, progressPct(modeled_c, goal.target_c));
  return { goal: { ...goal, modeled_c, progress_pct: pct }, crossed: milestonesCrossed(goal.progress_pct, pct) };
}

const strip = (g: LocalGoal): Goal => {
  const out: Partial<LocalGoal> = { ...g };
  delete out.zone_area_km2;
  return out as Goal;
};

export async function listGoals(ns: Namespace): Promise<Goal[]> {
  const all = await readList<LocalGoal>(ns, COLL.goals);
  return all.map(strip).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** The goal shown on Home/Plan: newest unfinished goal, else newest. */
export function activeGoal(goals: readonly Goal[]): Goal | null {
  return goals.find((g) => g.progress_pct < 100) ?? goals[0] ?? null;
}

export type CreateGoalInput = {
  zone: { id: string; name: string; centroid: LatLng; h3?: string[] };
  target_c: number;
  by_date: string;
  team_id?: string | null;
  org_id?: string | null;
};

export async function createGoal(ctx: DataContext, input: CreateGoalInput): Promise<Goal> {
  assertAccount(ctx.kind, 'goals');
  const goal: LocalGoal = {
    id: newId('g'),
    zone_id: input.zone.id,
    zone_name: input.zone.name,
    zone_centroid: input.zone.centroid,
    zone_area_km2: zoneAreaKm2(input.zone.h3),
    target_c: -Math.abs(input.target_c),
    by_date: input.by_date,
    progress_pct: 0,
    modeled_c: 0,
    team_id: input.team_id ?? null,
    org_id: input.org_id ?? null,
    created_at: new Date().toISOString(),
  };
  await updateList<LocalGoal>(ctx.ns, COLL.goals, (l) => [goal, ...l]);
  return strip(goal);
}

export async function updateGoal(
  ctx: DataContext,
  id: string,
  patch: Partial<Pick<Goal, 'target_c' | 'by_date' | 'team_id' | 'org_id'>>,
): Promise<Goal> {
  assertAccount(ctx.kind, 'goals');
  let out: LocalGoal | undefined;
  await updateList<LocalGoal>(ctx.ns, COLL.goals, (l) =>
    l.map((g) => {
      if (g.id !== id) return g;
      const target_c = patch.target_c === undefined ? g.target_c : -Math.abs(patch.target_c);
      out = { ...g, ...patch, target_c, progress_pct: progressPct(g.modeled_c, target_c) };
      return out;
    }),
  );
  if (!out) throw new Error(`Goal not found: ${id}`);
  return strip(out);
}

export async function deleteGoal(ctx: DataContext, id: string): Promise<void> {
  assertAccount(ctx.kind, 'goals');
  await updateList<LocalGoal>(ctx.ns, COLL.goals, (l) => l.filter((g) => g.id !== id));
}

/**
 * Presentation mode: the seeded goal has zone_id "demo:asad-gate" because live zone ids depend on the
 * scan. The first demo scan binds it to the hottest zone (keeping the story's name).
 */
export async function bindDemoGoalZone(ns: Namespace, scan: Pick<ZonesScan, 'zones'>): Promise<boolean> {
  if (ns !== DEMO_NAMESPACE || !scan.zones.length) return false;
  const top = [...scan.zones].sort((a, b) => a.rank - b.rank)[0];
  let changed = false;
  await updateList<LocalGoal>(ns, COLL.goals, (l) =>
    l.map((g) => {
      if (!g.zone_id.startsWith('demo:')) return g;
      changed = true;
      return { ...g, zone_id: top.id, zone_centroid: top.centroid, zone_area_km2: zoneAreaKm2(top.h3, g.zone_area_km2) };
    }),
  );
  return changed;
}
