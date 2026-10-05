'use client';
/** Place search and reverse geocoding (server-backed). */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { GeoSearchResponse, LatLng, ReverseGeocode } from '../types';
import { V0_ROUTES } from '../types';
import { useDataContext } from './context';
import { getJSON, shouldRetry } from './http';
import { qk } from './keys';

/** City search; runs from 2 characters. Debounce the input in the screen. */
export function useGeoSearch(q: string) {
  const ctx = useDataContext();
  const term = q.trim();
  return useQuery<GeoSearchResponse>({
    queryKey: qk.geoSearch(term, ctx.lang),
    enabled: ctx.ready && term.length >= 2,
    retry: shouldRetry,
    staleTime: 24 * 60 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => getJSON<GeoSearchResponse>(V0_ROUTES.geoSearch.path, { q: term, lang: ctx.lang }, signal),
  });
}

export function useGeoReverse(point: LatLng | null | undefined) {
  const ctx = useDataContext();
  return useQuery<ReverseGeocode>({
    queryKey: qk.geoReverse(point ?? { lat: 0, lng: 0 }, ctx.lang),
    enabled: ctx.ready && !!point,
    retry: shouldRetry,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: ({ signal }) => getJSON<ReverseGeocode>(V0_ROUTES.geoReverse.path, { lat: point!.lat, lng: point!.lng, lang: ctx.lang }, signal),
  });
}
