'use client';
/** Plan (POST /plan, keyed by goal), species and nurseries (server-backed). */
import { useQuery } from '@tanstack/react-query';

import type { Goal, LatLng, NurseriesResponse, Plan, PlanRequest, Species, SpeciesSummary, Meta } from '../types';
import { DataError } from '../errors';
import { getKV } from '../local/kv';
import { V0_ROUTES } from '../types';
import { cachePolicy, useDataContext } from './context';
import { getJSON, postJSON, routePath, shouldRetry } from './http';
import { qk } from './keys';

export type SpeciesList = { species: SpeciesSummary[]; meta: Meta };

/**
 * The plan for a (local) goal: a query that POSTs the goal + optional zone detail. Cached per goal
 * and per target/date/lang, so it only re-runs when the goal changes.
 */
export function usePlan(goal: Goal | null | undefined, zone?: PlanRequest['zone']) {
  const ctx = useDataContext();
  const sig = goal ? `${goal.zone_id}|${goal.target_c}|${goal.by_date}` : '';
  return useQuery<Plan>({
    queryKey: qk.plan(goal?.id ?? '', sig, ctx.lang),
    enabled: ctx.ready && !!goal && !goal.zone_id.startsWith('demo:'),
    retry: shouldRetry,
    staleTime: 6 * 60 * 60 * 1000,
    ...cachePolicy(ctx),
    queryFn: async ({ signal }) => {
      const g = goal!;
      const body: PlanRequest = {
        goal: { id: g.id, zone_id: g.zone_id, zone_name: g.zone_name, zone_centroid: g.zone_centroid, target_c: g.target_c, by_date: g.by_date },
        zone: zone ?? null,
        lang: ctx.lang,
      };
      // POST responses can't sit in the service-worker cache, so the last good plan per goal is
      // kept on the device and served when the network is gone (offline demo safety net).
      const key = `${ctx.ns}:plan-cache:${g.id}|${sig}|${ctx.lang}`;
      try {
        const plan = await postJSON<Plan>(V0_ROUTES.plan.path, body, signal);
        void getKV()
          .then((kv) => kv.set(key, plan))
          .catch(() => undefined);
        return plan;
      } catch (e) {
        const offline = e instanceof DataError && (e.code === 'network.error' || e.status >= 500);
        if (offline) {
          const kept = await getKV()
            .then((kv) => kv.get<Plan>(key))
            .catch(() => undefined);
          if (kept) return { ...kept, meta: { ...kept.meta, live: false } };
        }
        throw e;
      }
    },
  });
}

/** Species shortlist for a location (curated for Bangladesh, AI elsewhere). */
export function useSpecies(point: LatLng | null | undefined) {
  const ctx = useDataContext();
  return useQuery<SpeciesList>({
    queryKey: qk.species(point ?? null, ctx.lang),
    enabled: ctx.ready,
    retry: shouldRetry,
    staleTime: 24 * 60 * 60 * 1000,
    ...cachePolicy(ctx),
    queryFn: ({ signal }) =>
      getJSON<SpeciesList>(V0_ROUTES.species.path, { lat: point?.lat, lng: point?.lng, lang: ctx.lang }, signal),
  });
}

export function useSpeciesDetail(id: string | null | undefined, point?: LatLng | null) {
  const ctx = useDataContext();
  return useQuery<Species>({
    queryKey: qk.speciesOne(id ?? '', point ?? null, ctx.lang),
    enabled: ctx.ready && !!id,
    retry: shouldRetry,
    staleTime: 24 * 60 * 60 * 1000,
    ...cachePolicy(ctx),
    queryFn: ({ signal }) =>
      getJSON<Species>(routePath(V0_ROUTES.speciesOne.path, { id: id! }), { lat: point?.lat, lng: point?.lng, lang: ctx.lang }, signal),
  });
}

export function useNurseries(point: LatLng | null | undefined, radius_m = 5000) {
  const ctx = useDataContext();
  return useQuery<NurseriesResponse>({
    queryKey: qk.nurseries(point ?? { lat: 0, lng: 0 }, radius_m),
    enabled: ctx.ready && !!point,
    retry: shouldRetry,
    staleTime: 24 * 60 * 60 * 1000,
    ...cachePolicy(ctx),
    queryFn: ({ signal }) => getJSON<NurseriesResponse>(V0_ROUTES.nurseries.path, { lat: point!.lat, lng: point!.lng, radius_m }, signal),
  });
}
