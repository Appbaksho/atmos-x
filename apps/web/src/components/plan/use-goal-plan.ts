'use client';

/**
 * Composes the data hooks the Plan/Act screens share (no new data logic, just wiring):
 *  - the active goal (or a goal by id),
 *  - in Presentation mode, a zone scan that binds the seeded `demo:asad-gate` goal to the live
 *    hottest zone (V0-3 binds it inside useZones; usePlan stays disabled until then),
 *  - the plan for that goal,
 *  - the point the screens use for species / nurseries (goal zone centroid, else the focus).
 */
import { cellArea } from 'h3-js';
import { useEffect, useMemo } from 'react';

import { useCz, useLocation } from '@/components/cz';
import { ACTION_BY_ID, DEMO_POINT, GUEST_MAX_RADIUS_M, useGoals, usePlan, useSession, useZones } from '@/lib/data/hooks';
import type { Goal, LatLng } from '@/lib/data/types';

export function isUnbound(goal: Goal | null | undefined): boolean {
  return !!goal && goal.zone_id.startsWith('demo:');
}

/** The goal to show: by id when given, else the active one. */
export function useGoalPlan(goalId?: string | null) {
  const { prefs } = useCz();
  const session = useSession();
  const { focus } = useLocation();
  const goals = useGoals();
  const goal = useMemo<Goal | null>(() => {
    if (goalId) return goals.data?.find((g) => g.id === goalId) ?? null;
    return goals.active ?? null;
  }, [goalId, goals.data, goals.active]);

  // Presentation mode, first load: the demo-namespace goals query can run before the story seed
  // has been written and cache []. Refetch a couple of times so the seeded goal shows up.
  const emptyDemo = session.presentation && !!goals.data && goals.data.length === 0;
  const { refetch } = goals;
  useEffect(() => {
    if (!emptyDemo) return;
    const ids = [800, 2500].map((ms) => setTimeout(() => void refetch(), ms));
    return () => ids.forEach(clearTimeout);
  }, [emptyDemo, refetch]);

  const unbound = isUnbound(goal);
  const radius = session.isGuest ? Math.min(prefs.radius_m, GUEST_MAX_RADIUS_M) : prefs.radius_m;
  // Only scans while the demo goal is unbound; the query is shared with Home/Map (same key).
  const scan = useZones(unbound ? (session.presentation ? DEMO_POINT : focus) : null, radius);
  const plan = usePlan(unbound ? null : goal);

  const point: LatLng = goal && !unbound ? goal.zone_centroid : session.presentation ? DEMO_POINT : focus;

  return {
    session,
    goals,
    goal,
    plan,
    point,
    /** true while the demo goal waits for its zone */
    binding: unbound && (scan.isLoading || scan.isFetching || !scan.isError),
    bindError: unbound && scan.isError ? scan.error : null,
    retryBind: () => void scan.refetch(),
  };
}

/** Zone area (km²) from its H3 cells, floored at 0.1 km² like the server's cooling maths. */
export function zoneArea(h3: readonly string[] | null | undefined, floor = 0.1): number {
  if (!h3?.length) return floor;
  let a = 0;
  for (const c of h3) {
    try {
      a += cellArea(c, 'km2');
    } catch {
      // invalid cell id
    }
  }
  return Math.max(floor, a);
}

/** °C per mature tree for a zone of `areaKm2` (same coefficient as the server). */
export const treeCoolingC = (areaKm2: number) => ACTION_BY_ID.plant_tree.cooling_per_unit / Math.max(0.1, areaKm2);
/** °C per m² of cool roof. */
export const roofCoolingC = (areaKm2: number) => ACTION_BY_ID.cool_roof.cooling_per_unit / 10 / Math.max(0.1, areaKm2);
/** °C per shade structure. */
export const shadeCoolingC = (areaKm2: number) => ACTION_BY_ID.shade_structure.cooling_per_unit / Math.max(0.1, areaKm2);

/** Same capacity rules as the server's feasibility (25 m² per sapling, 8 m street spacing, 60 % of roofs). */
export function capacity(space: { ground_m2: number; roof_m2: number; roadside_m: number }) {
  return { trees: Math.floor(space.ground_m2 / 25 + space.roadside_m / 8), roof_m2: Math.floor(space.roof_m2 * 0.6) };
}

/** Target options (°C) and timeline options (months). */
export const TARGETS = [-0.5, -1, -1.5, -2] as const;
export const TIMELINES = [
  { key: 'm3', months: 3 },
  { key: 'y1', months: 12 },
  { key: 'y2', months: 24 },
  { key: 'y5', months: 60 },
] as const;

export function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

export function monthsUntil(iso: string, now = Date.now()): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, (t - now) / (30.44 * 864e5)) : 12;
}
