'use client';
/** Place search, reverse geocoding and IP city (server-backed, cached on the API). */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { GeoSearchResponse, LatLng, Meta, ReverseGeocode } from '../types';
import { useDataContext } from './context';
import { getJSON, shouldRetry } from './http';
import { API } from './heat';
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
    queryFn: ({ signal }) => getJSON<GeoSearchResponse>(`${API}/geo/search`, { q: term, lang: ctx.lang }, signal),
  });
}

export function useGeoReverse(point: LatLng | null | undefined) {
  const ctx = useDataContext();
  return useQuery<ReverseGeocode>({
    queryKey: qk.geoReverse(point ?? { lat: 0, lng: 0 }, ctx.lang),
    enabled: ctx.ready && !!point,
    retry: shouldRetry,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: ({ signal }) => getJSON<ReverseGeocode>(`${API}/geo/reverse`, { lat: point!.lat, lng: point!.lng, lang: ctx.lang }, signal),
  });
}

export type IpCity = { result: { city: string | null; country: string | null; country_code: string | null; location: LatLng } | null; meta: Meta };

/** City from this device's IP, looked up locally on the server (no third party). Used when location is refused (L8). */
export function useIpCity(enabled: boolean) {
  const ctx = useDataContext();
  return useQuery<IpCity>({
    queryKey: ['atmos', 'server', 'geo-ip'],
    enabled: ctx.ready && enabled,
    retry: shouldRetry,
    staleTime: 60 * 60 * 1000,
    queryFn: ({ signal }) => getJSON<IpCity>(`${API}/geo/ip`, undefined, signal),
  });
}
