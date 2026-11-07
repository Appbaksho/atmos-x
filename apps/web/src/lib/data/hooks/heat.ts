'use client';
/**
 * Heat now, zones, zone detail, projection, planting spots, NASA GIBS layer (prompt-v1 §9).
 * Every number comes from the API; a scan is a database read on the server, so a cold area returns
 * `status: 'partial'` at once and this hook polls until the satellite job has filled the hexes.
 */
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect } from 'react';

import { guardScanRadius } from '../local/guest';
import type { Conditions, LatLng, PlantingSpots, Projection, ScanJob, ZoneDetail, ZoneSummary, ZonesScan } from '../types';
import { cachePolicy, useDataContext } from './context';
import { getJSON, shouldRetry } from './http';
import { qk } from './keys';

export const API = '/api/v1';

const PARTIAL_POLL_MS = 4000;

/**
 * Zones are named once by a worker job (Nominatim); until then `name` is '' and `name_text` says
 * "Zone N". Fill the display name here so every screen can render `zone.name`.
 */
function useNameFill() {
  const ts = useTranslations('server');
  return useCallback(<Z extends Pick<ZoneSummary, 'name' | 'name_text' | 'rank'>>(z: Z): Z => (z.name ? z : { ...z, name: ts('zone.unnamed', { n: z.rank }) }), [ts]);
}
const SPOTS_POLL_MS = 6000;
/** Zone names arrive from a worker job shortly after a scan is built. */
const NAME_POLL_MS = 8000;

/** Pass `DEMO_POINT` in Presentation mode. `null` disables the query. */
export function useConditions(point: LatLng | null | undefined) {
  const ctx = useDataContext();
  return useQuery<Conditions>({
    queryKey: qk.conditions(point ?? { lat: 0, lng: 0 }, ctx.lang),
    enabled: ctx.ready && !!point,
    retry: shouldRetry,
    ...cachePolicy(ctx),
    // NASA normals and GEOS-FP arrive from the worker; refetch once they are pending.
    refetchInterval: (q) => (q.state.data?.normal_status === 'pending' ? 20_000 : false),
    queryFn: ({ signal }) => getJSON<Conditions>(`${API}/conditions`, { lat: point!.lat, lng: point!.lng, lang: ctx.lang }, signal),
  });
}

/**
 * Hex scan around a point. Guests are limited to 500 m: a wider radius throws GuestRestrictedError
 * (map it to requireAccount(); clamp the slider with GUEST_MAX_RADIUS_M to avoid it).
 * While the scan is `partial`, it refetches every few seconds until the hexes are complete.
 */
export function useZones(point: LatLng | null | undefined, radius_m: number) {
  const ctx = useDataContext();
  const fill = useNameFill();
  const select = useCallback((d: ZonesScan): ZonesScan => ({ ...d, zones: d.zones.map(fill) }), [fill]);
  return useQuery<ZonesScan>({
    select,
    queryKey: qk.zones(point ?? { lat: 0, lng: 0 }, Math.round(radius_m), ctx.lang),
    enabled: ctx.ready && !!point,
    retry: shouldRetry,
    placeholderData: keepPreviousData,
    ...cachePolicy(ctx),
    refetchInterval: (q) =>
      q.state.data?.scan.status === 'partial' ? PARTIAL_POLL_MS : q.state.data?.zones.some((z) => !z.name) ? NAME_POLL_MS : false,
    queryFn: ({ signal }) => {
      const radius = guardScanRadius(ctx.kind, radius_m);
      return getJSON<ZonesScan>(`${API}/zones`, { lat: point!.lat, lng: point!.lng, radius_m: radius, lang: ctx.lang }, signal);
    },
  });
}

/** Progress of the satellite job behind a partial scan. */
export function useScanJob(jobId: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<ScanJob>({
    queryKey: ['atmos', 'server', 'scan-job', jobId ?? ''],
    enabled: ctx.ready && !!jobId,
    retry: shouldRetry,
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'done' || q.state.data.status === 'failed') ? false : 2500),
    queryFn: ({ signal }) => getJSON<ScanJob>(`${API}/scan-jobs/${encodeURIComponent(jobId!)}`, undefined, signal),
  });
}

export function useZone(id: string | null | undefined) {
  const ctx = useDataContext();
  const select = useNameFill();
  return useQuery<ZoneDetail>({
    select,
    queryKey: qk.zone(id ?? '', ctx.lang),
    enabled: ctx.ready && !!id,
    retry: shouldRetry,
    ...cachePolicy(ctx),
    refetchInterval: (q) => (q.state.data && !q.state.data.name ? NAME_POLL_MS : q.state.data?.history_status === 'pending' ? 30_000 : false),
    queryFn: ({ signal }) => getJSON<ZoneDetail>(`${API}/zones/${encodeURIComponent(id!)}`, { lang: ctx.lang }, signal),
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
    queryFn: ({ signal }) => getJSON<Projection>(`${API}/zones/${encodeURIComponent(id!)}/projection`, a, signal),
  });
}

/** Planting spots come from an OpenStreetMap job; `status: 'pending'` until it lands (it polls). */
export function usePlantingSpots(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<PlantingSpots>({
    queryKey: qk.plantingSpots(id ?? ''),
    enabled: ctx.ready && !!id,
    retry: shouldRetry,
    ...cachePolicy(ctx),
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? SPOTS_POLL_MS : false),
    queryFn: ({ signal }) => getJSON<PlantingSpots>(`${API}/zones/${encodeURIComponent(id!)}/planting-spots`, undefined, signal),
  });
}

export type GibsLayer = { layer: string; date: string | null; tile_url: string; max_zoom: number; meta: import('../types').Meta };

/** NASA GIBS daily MODIS land-surface temperature tiles for city zoom (E11). */
export function useGibsLayer() {
  const ctx = useDataContext();
  return useQuery<GibsLayer>({
    queryKey: ['atmos', 'server', 'gibs'],
    enabled: ctx.ready,
    retry: shouldRetry,
    staleTime: 60 * 60 * 1000,
    queryFn: ({ signal }) => getJSON<GibsLayer>(`${API}/map/gibs`, undefined, signal),
  });
}

/** Warm the cache for the zone screen the user is likely to open next. */
export function usePrefetchZone(id: string | null | undefined, opts: { spots?: boolean } = {}) {
  const ctx = useDataContext();
  const qc = useQueryClient();
  const spots = !!opts.spots;
  useEffect(() => {
    if (!ctx.ready || !id) return;
    const timer = setTimeout(() => {
      void qc.prefetchQuery({
        queryKey: qk.zone(id, ctx.lang),
        queryFn: ({ signal }) => getJSON<ZoneDetail>(`${API}/zones/${encodeURIComponent(id)}`, { lang: ctx.lang }, signal),
        ...cachePolicy(ctx),
      });
      if (spots) {
        void qc.prefetchQuery({
          queryKey: qk.plantingSpots(id),
          queryFn: ({ signal }) => getJSON<PlantingSpots>(`${API}/zones/${encodeURIComponent(id)}/planting-spots`, undefined, signal),
          ...cachePolicy(ctx),
        });
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx fields listed explicitly
  }, [id, ctx.ready, ctx.lang, ctx.presentation, spots, qc]);
}
