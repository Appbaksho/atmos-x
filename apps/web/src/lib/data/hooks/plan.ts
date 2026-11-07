'use client';
/** Plan (per goal, or a preview before a goal exists), species and nurseries, from the API. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { Goal, LatLng, Meta, NurseriesResponse, Plan, Species, SpeciesSummary } from '../types';
import { cachePolicy, useDataContext } from './context';
import { getJSON, shouldRetry } from './http';
import { API } from './heat';
import { qk } from './keys';

export type SpeciesList = { species: SpeciesSummary[]; region?: string; meta: Meta };

/** The plan for a saved goal. Refetches while planting spots are still being fetched. */
export function usePlan(goal: Goal | null | undefined, _zone?: unknown) {
  void _zone;
  const ctx = useDataContext();
  const sig = goal ? `${goal.zone_id}|${goal.target_c}|${goal.by_date}` : '';
  return useQuery<Plan>({
    queryKey: qk.plan(goal?.id ?? '', sig, ctx.lang),
    enabled: ctx.ready && !!goal && ctx.kind !== 'guest',
    retry: shouldRetry,
    ...cachePolicy(ctx),
    refetchInterval: (q) => (q.state.data?.feasibility.spots_status === 'pending' ? 8000 : false),
    queryFn: ({ signal }) => getJSON<Plan>(`${API}/goals/${encodeURIComponent(goal!.id)}/plan`, { lang: ctx.lang }, signal),
  });
}

/** Plan and feasibility for a zone, target and date before any goal exists (wizard, guests). */
export function usePlanPreview(zoneId: string | null | undefined, target_c: number, by_date: string) {
  const ctx = useDataContext();
  return useQuery<Plan>({
    queryKey: ['atmos', 'server', 'plan-preview', zoneId ?? '', target_c, by_date, ctx.lang],
    enabled: ctx.ready && !!zoneId,
    retry: shouldRetry,
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.feasibility.spots_status === 'pending' ? 8000 : false),
    queryFn: ({ signal }) => getJSON<Plan>(`${API}/plan/preview`, { zone_id: zoneId!, target_c, by_date, lang: ctx.lang }, signal),
  });
}

/** Species for a location: the curated Bangladesh list, else commonly planted trees for the climate band. */
export function useSpecies(point: LatLng | null | undefined) {
  const ctx = useDataContext();
  return useQuery<SpeciesList>({
    queryKey: qk.species(point ?? null, ctx.lang),
    enabled: ctx.ready,
    retry: shouldRetry,
    staleTime: 24 * 60 * 60 * 1000,
    ...cachePolicy(ctx),
    queryFn: ({ signal }) => getJSON<SpeciesList>(`${API}/species`, { lat: point?.lat, lng: point?.lng, lang: ctx.lang }, signal),
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
    queryFn: ({ signal }) => getJSON<Species>(`${API}/species/${encodeURIComponent(id!)}`, { lang: ctx.lang }, signal),
  });
}

/** Nearby nurseries from OpenStreetMap (a worker job; `status: 'pending'` until it lands). */
export function useNurseries(point: LatLng | null | undefined, radius_m = 5000) {
  const ctx = useDataContext();
  const ts = useTranslations('server');
  const select = useCallback(
    (d: NurseriesResponse) => ({ ...d, nurseries: d.nurseries.map((n) => (n.name ? n : { ...n, name: ts('nursery.unnamed') })) }) as NurseriesResponse & { nurseries: (NurseriesResponse['nurseries'][number] & { name: string })[] },
    [ts],
  );
  return useQuery<NurseriesResponse, Error, NurseriesResponse & { nurseries: (NurseriesResponse['nurseries'][number] & { name: string })[] }>({
    select,
    queryKey: qk.nurseries(point ?? { lat: 0, lng: 0 }, radius_m),
    enabled: ctx.ready && !!point,
    retry: shouldRetry,
    ...cachePolicy(ctx),
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 8000 : false),
    queryFn: ({ signal }) => getJSON<NurseriesResponse>(`${API}/nurseries`, { lat: point!.lat, lng: point!.lng, radius_m }, signal),
  });
}
