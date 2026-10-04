'use client';
/** Heat now, zones, zone detail, projection, planting spots (server-backed). */
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import { bindDemoGoalZone } from '../local/goals';
import { guardScanRadius } from '../local/guest';
import { maybeNotifyHeat } from '../local/notifications';
import { getDataContext } from '../local/context';
import type { Conditions, LatLng, PlantingSpots, Projection, ZoneDetail, ZonesScan } from '../types';
import { V0_ROUTES } from '../types';
import { cachePolicy, useDataContext } from './context';
import { getJSON, routePath, shouldRetry } from './http';
import { qk } from './keys';

/** Pass `DEMO_POINT` in Presentation mode. `null` disables the query. */
export function useConditions(point: LatLng | null | undefined) {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useQuery<Conditions>({
    queryKey: qk.conditions(point ?? { lat: 0, lng: 0 }, ctx.lang),
    enabled: ctx.ready && !!point,
    retry: shouldRetry,
    ...cachePolicy(ctx),
    queryFn: async ({ signal }) => {
      const data = await getJSON<Conditions>(V0_ROUTES.conditions.path, { lat: point!.lat, lng: point!.lng, lang: ctx.lang }, signal);
      // heat warning notification (moderate+), at most once a day
      void maybeNotifyHeat(getDataContext(), data)
        .then((added) => {
          if (added) void qc.invalidateQueries({ queryKey: qk.notifications(getDataContext().ns) });
        })
        .catch(() => undefined);
      return data;
    },
  });
}

/**
 * Hex scan around a point. Guests are limited to 500 m: a wider radius throws GuestRestrictedError
 * (map it to requireAccount(); clamp the slider with GUEST_MAX_RADIUS_M to avoid it).
 */
export function useZones(point: LatLng | null | undefined, radius_m: number) {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useQuery<ZonesScan>({
    queryKey: qk.zones(point ?? { lat: 0, lng: 0 }, Math.round(radius_m), ctx.lang),
    enabled: ctx.ready && !!point,
    retry: shouldRetry,
    placeholderData: keepPreviousData,
    ...cachePolicy(ctx),
    queryFn: async ({ signal }) => {
      const radius = guardScanRadius(ctx.kind, radius_m);
      const scan = await getJSON<ZonesScan>(V0_ROUTES.zones.path, { lat: point!.lat, lng: point!.lng, radius_m: radius, lang: ctx.lang }, signal);
      // Presentation mode: bind the story's goal to the live hottest zone
      if (ctx.presentation) {
        void bindDemoGoalZone(ctx.ns, scan)
          .then((changed) => {
            if (changed) void qc.invalidateQueries({ queryKey: qk.goals(ctx.ns) });
          })
          .catch(() => undefined);
      }
      return scan;
    },
  });
}

export function useZone(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<ZoneDetail>({
    queryKey: qk.zone(id ?? '', ctx.lang),
    enabled: ctx.ready && !!id,
    retry: shouldRetry,
    ...cachePolicy(ctx),
    queryFn: ({ signal }) => getJSON<ZoneDetail>(routePath(V0_ROUTES.zone.path, { id: id! }), { lang: ctx.lang }, signal),
  });
}

export type ProjectionInput = { trees: number; roof_m2: number; shade: number };

/** Debounce slider values in the screen; previous data stays visible while refetching. */
export function useProjection(id: string | null | undefined, input: ProjectionInput) {
  const ctx = useDataContext();
  const a = { trees: Math.max(0, Math.round(input.trees)), roof_m2: Math.max(0, Math.round(input.roof_m2)), shade: Math.max(0, Math.round(input.shade)) };
  return useQuery<Projection>({
    queryKey: qk.projection(id ?? '', a),
    enabled: ctx.ready && !!id,
    retry: shouldRetry,
    placeholderData: keepPreviousData,
    ...cachePolicy(ctx),
    queryFn: ({ signal }) => getJSON<Projection>(routePath(V0_ROUTES.projection.path, { id: id! }), { ...a, lang: ctx.lang }, signal),
  });
}

export function usePlantingSpots(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<PlantingSpots>({
    queryKey: qk.plantingSpots(id ?? ''),
    enabled: ctx.ready && !!id,
    retry: shouldRetry,
    staleTime: 60 * 60 * 1000,
    ...cachePolicy(ctx),
    queryFn: ({ signal }) => getJSON<PlantingSpots>(routePath(V0_ROUTES.plantingSpots.path, { id: id! }), undefined, signal),
  });
}
