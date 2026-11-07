'use client';
/**
 * Location context: port of apps/mobile/src/context/location.tsx for the web.
 *
 *   const { device, focus, placeName, permission, loading, error, pinned,
 *           refresh, setFocus, resetFocus, search } = useLocation();
 *
 * - `device`: the browser's position (navigator.geolocation), null until granted.
 * - `focus`: the point being analysed (device position, a picked city/spot, the city from IP, or the
 *   demo point in Presentation mode). Data hooks key on `focus`.
 * - `resolved` (L11): false until the place really comes from somewhere: a restored choice, a device
 *   fix, a picked place, the city from IP (L8) or the demo. There is no silent default place; while
 *   `needsPlace` is true the app shell asks for one instead of showing data for a made-up spot.
 * - Permission is never requested on load: onboarding (S03) and "Use my location" call `refresh()`.
 *   If it was already granted, the position is fetched automatically and then watched with high
 *   accuracy (L9); moving more than 100 m re-scans. `accuracyM` feeds the map's accuracy circle.
 * - Presentation mode (prefs.presentation) pins focus to NEXT_PUBLIC_DEMO_LAT/LNG; its name comes
 *   from the same reverse geocode as every other place (E12).
 * - `search(q)` calls GET /api/v1/geo/search and falls back to a small static list (incl. Dhaka).
 * - The chosen focus is persisted in IndexedDB so it survives reloads.
 */
import { get, set } from 'idb-keyval';
import { useLocale } from 'next-intl';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { GeoSearchResponse, LatLng, Place, ReverseGeocode } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';

export type LocationPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

export const DEMO_POINT: LatLng = {
  lat: Number(process.env.NEXT_PUBLIC_DEMO_LAT ?? 23.759) || 23.759,
  lng: Number(process.env.NEXT_PUBLIC_DEMO_LNG ?? 90.359) || 90.359,
};
/** L9: a move this far from the scanned point re-scans. */
const RESCAN_M = 100;

/** Offline / pre-V0-2 city list for the manual search. */
export const STATIC_PLACES: Place[] = [
  { name: 'Mohammadpur', admin: 'Dhaka', country: 'Bangladesh', country_code: 'BD', location: DEMO_POINT },
  { name: 'Dhaka', admin: 'Dhaka Division', country: 'Bangladesh', country_code: 'BD', location: { lat: 23.8103, lng: 90.4125 } },
  { name: 'Dhanmondi', admin: 'Dhaka', country: 'Bangladesh', country_code: 'BD', location: { lat: 23.7465, lng: 90.376 } },
  { name: 'Mirpur', admin: 'Dhaka', country: 'Bangladesh', country_code: 'BD', location: { lat: 23.8223, lng: 90.3654 } },
  { name: 'Gulshan', admin: 'Dhaka', country: 'Bangladesh', country_code: 'BD', location: { lat: 23.7925, lng: 90.4078 } },
  { name: 'Chattogram', admin: 'Chattogram Division', country: 'Bangladesh', country_code: 'BD', location: { lat: 22.3569, lng: 91.7832 } },
  { name: 'Khulna', admin: 'Khulna Division', country: 'Bangladesh', country_code: 'BD', location: { lat: 22.8456, lng: 89.5403 } },
  { name: 'Rajshahi', admin: 'Rajshahi Division', country: 'Bangladesh', country_code: 'BD', location: { lat: 24.3745, lng: 88.6042 } },
  { name: 'Sylhet', admin: 'Sylhet Division', country: 'Bangladesh', country_code: 'BD', location: { lat: 24.8949, lng: 91.8687 } },
  { name: 'Sunamganj', admin: 'Sylhet Division', country: 'Bangladesh', country_code: 'BD', location: { lat: 25.0658, lng: 91.395 } },
  { name: 'Kolkata', admin: 'West Bengal', country: 'India', country_code: 'IN', location: { lat: 22.5726, lng: 88.3639 } },
  { name: 'Delhi', admin: 'Delhi', country: 'India', country_code: 'IN', location: { lat: 28.6139, lng: 77.209 } },
  { name: 'Karachi', admin: 'Sindh', country: 'Pakistan', country_code: 'PK', location: { lat: 24.8607, lng: 67.0011 } },
  { name: 'Lahore', admin: 'Punjab', country: 'Pakistan', country_code: 'PK', location: { lat: 31.5204, lng: 74.3587 } },
  { name: 'Cairo', admin: 'Cairo', country: 'Egypt', country_code: 'EG', location: { lat: 30.0444, lng: 31.2357 } },
  { name: 'Jakarta', admin: 'DKI Jakarta', country: 'Indonesia', country_code: 'ID', location: { lat: -6.2088, lng: 106.8456 } },
  { name: 'Madrid', admin: 'Madrid', country: 'Spain', country_code: 'ES', location: { lat: 40.4168, lng: -3.7038 } },
  { name: 'Paris', admin: 'Île-de-France', country: 'France', country_code: 'FR', location: { lat: 48.8566, lng: 2.3522 } },
  { name: 'São Paulo', admin: 'São Paulo', country: 'Brazil', country_code: 'BR', location: { lat: -23.5505, lng: -46.6333 } },
  { name: 'Beijing', admin: 'Beijing', country: 'China', country_code: 'CN', location: { lat: 39.9042, lng: 116.4074 } },
];

type LocationState = {
  /** Device position (null until permission is granted and a fix arrives) */
  device: LatLng | null;
  /** The point currently being analysed */
  focus: LatLng;
  placeName: string | null;
  permission: LocationPermission;
  loading: boolean;
  /** 'denied' | 'unavailable' | 'timeout' after a failed refresh() */
  error: 'denied' | 'unavailable' | 'timeout' | null;
  /** Focus is a picked place/spot rather than the device position */
  custom: boolean;
  /** Presentation mode: focus pinned to the demo point */
  pinned: boolean;
  /** True once the persisted focus has been restored */
  ready: boolean;
  /** The place came from somewhere real (device, choice, IP city or the demo) */
  resolved: boolean;
  /** Nothing could resolve a place: the app asks the person to pick one */
  needsPlace: boolean;
  /** Device fix accuracy in metres (null without a fix) */
  accuracyM: number | null;
  setFocus: (p: LatLng, name?: string | null) => void;
  resetFocus: () => void;
  /** Ask for permission (if needed) and get a fresh fix. Resolves with the position or null. */
  refresh: () => Promise<LatLng | null>;
  /** City search: /api/v1/geo/search, falling back to STATIC_PLACES */
  search: (q: string, signal?: AbortSignal) => Promise<Place[]>;
};

const Ctx = createContext<LocationState | null>(null);
const KEY = 'atmos:location:v1';
type Persisted = { focus: LatLng; placeName: string | null; custom: boolean; device: LatLng | null };

function distKm(a: LatLng, b: LatLng): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

async function fetchJson<T>(url: string, ms: number, signal?: AbortSignal): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function staticSearch(q: string): Place[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return STATIC_PLACES.filter((p) => [p.name, p.admin, p.country].some((x) => x?.toLowerCase().includes(s))).slice(0, 8);
}

function nearestStatic(p: LatLng): string | null {
  let best: Place | null = null;
  let bestD = Infinity;
  for (const s of STATIC_PLACES) {
    const d = distKm(p, s.location);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best && bestD < 8 ? [best.name, best.admin].filter(Boolean).join(', ') : null;
}

const GEO_OPTS: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 60 * 1000 };

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTS));
}

type IpCity = { result: { city: string; country: string | null; location: LatLng } | null };

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { prefs, ready: prefsReady } = useCz();
  const locale = useLocale();
  const [device, setDevice] = useState<LatLng | null>(null);
  const [focus, setFocusState] = useState<LatLng>(DEMO_POINT);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [permission, setPermission] = useState<LocationPermission>('unknown');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LocationState['error']>(null);
  const [custom, setCustom] = useState(false);
  const [ready, setReady] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [needsPlace, setNeedsPlace] = useState(false);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [demoName, setDemoName] = useState<string | null>(null);
  const customRef = useRef(false);
  const focusRef = useRef<LatLng | null>(null);
  const resolvedRef = useRef(false);
  const reqId = useRef(0);
  const pinned = prefs.presentation;

  const reverse = useCallback(
    async (p: LatLng): Promise<string | null> => {
      try {
        const r = await fetchJson<ReverseGeocode>(`/api/v1/geo/reverse?lat=${p.lat}&lng=${p.lng}&lang=${locale}`, 6000);
        return r.place || nearestStatic(p);
      } catch {
        return nearestStatic(p);
      }
    },
    [locale],
  );

  const name = useCallback(
    (p: LatLng) => {
      const id = ++reqId.current;
      reverse(p).then((n) => {
        if (id === reqId.current) setPlaceName(n);
      });
    },
    [reverse],
  );

  // Restore persisted focus + read the permission state (no prompt).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = typeof indexedDB === 'undefined' ? undefined : await get<Persisted>(KEY);
        if (alive && saved) {
          setFocusState(saved.focus);
          focusRef.current = saved.focus;
          setPlaceName(saved.placeName);
          setCustom(saved.custom);
          customRef.current = saved.custom;
          setDevice(saved.device);
          resolvedRef.current = true;
          setResolved(true);
        }
      } catch {
        // storage unavailable
      }
      if (!('geolocation' in navigator)) {
        if (alive) setPermission('unsupported');
      } else if (navigator.permissions?.query) {
        try {
          const st = await navigator.permissions.query({ name: 'geolocation' });
          if (alive) setPermission(st.state as LocationPermission);
          st.onchange = () => setPermission(st.state as LocationPermission);
        } catch {
          // Safari < 16: unknown until asked
        }
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Persist (only a place that was really resolved).
  useEffect(() => {
    if (!ready || pinned || !resolved) return;
    set(KEY, { focus, placeName, custom, device } satisfies Persisted).catch(() => {});
  }, [ready, pinned, resolved, focus, placeName, custom, device]);

  const markResolved = useCallback(() => {
    resolvedRef.current = true;
    setResolved(true);
    setNeedsPlace(false);
  }, []);

  /** L8: the city from the IP address, when no device fix or choice exists. */
  const fromIp = useCallback(async () => {
    if (resolvedRef.current) return;
    try {
      const r = await fetchJson<IpCity>('/api/v1/geo/ip', 5000);
      if (r.result && !resolvedRef.current) {
        setFocusState(r.result.location);
        focusRef.current = r.result.location;
        setPlaceName([r.result.city, r.result.country].filter(Boolean).join(', '));
        markResolved();
        return;
      }
    } catch {
      // no IP city (local network, lookup down)
    }
    if (!resolvedRef.current) setNeedsPlace(true);
  }, [markResolved]);

  const refresh = useCallback(async (): Promise<LatLng | null> => {
    if (!('geolocation' in navigator)) {
      setPermission('unsupported');
      setError('unavailable');
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const pos = await getPosition();
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPermission('granted');
      setDevice(p);
      setAccuracyM(Math.round(pos.coords.accuracy));
      if (!customRef.current) {
        setFocusState(p);
        focusRef.current = p;
        name(p);
      }
      markResolved();
      return p;
    } catch (e) {
      const code = (e as GeolocationPositionError).code;
      if (code === 1) {
        setPermission('denied');
        setError('denied');
      } else setError(code === 3 ? 'timeout' : 'unavailable');
      void fromIp();
      return null;
    } finally {
      setLoading(false);
    }
  }, [name, markResolved, fromIp]);

  // Resolve on load without prompting: a granted permission gets a fix; otherwise the IP city.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!ready || !prefsReady || pinned || autoStarted.current) return;
    if (permission === 'unknown' && 'permissions' in navigator) return; // still reading the state
    autoStarted.current = true;
    // After this render (both start async work that sets state).
    void Promise.resolve().then(async () => {
      if (permission === 'granted') await refresh();
      else await fromIp();
    });
  }, [ready, prefsReady, pinned, permission, refresh, fromIp]);

  // L9: follow the device with high accuracy once allowed; a move over 100 m re-scans.
  useEffect(() => {
    if (!ready || pinned || permission !== 'granted' || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setAccuracyM(Math.round(pos.coords.accuracy));
        setDevice((d) => (d && distKm(d, p) * 1000 < 10 ? d : p));
        const f = focusRef.current;
        if (!customRef.current && (!f || distKm(f, p) * 1000 > RESCAN_M)) {
          setFocusState(p);
          focusRef.current = p;
          name(p);
          markResolved();
        }
      },
      () => undefined,
      GEO_OPTS,
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [ready, pinned, permission, name, markResolved]);

  // E12: the demo place is named by the same reverse geocode as any other point.
  useEffect(() => {
    if (!pinned) return;
    let alive = true;
    void reverse(DEMO_POINT).then((n) => {
      if (alive) setDemoName(n);
    });
    return () => {
      alive = false;
    };
  }, [pinned, reverse]);

  const setFocus = useCallback(
    (p: LatLng, n?: string | null) => {
      customRef.current = true;
      setCustom(true);
      setFocusState(p);
      focusRef.current = p;
      markResolved();
      if (n) {
        reqId.current++;
        setPlaceName(n);
      } else {
        setPlaceName(null);
        name(p);
      }
    },
    [name, markResolved],
  );

  /** Back to the device position; without a fix, ask for one (no made-up place). */
  const resetFocus = useCallback(() => {
    customRef.current = false;
    setCustom(false);
    if (device) {
      setFocusState(device);
      focusRef.current = device;
      setPlaceName(null);
      name(device);
    } else void refresh();
  }, [device, name, refresh]);

  const search = useCallback(
    async (q: string, signal?: AbortSignal): Promise<Place[]> => {
      const s = q.trim();
      if (s.length < 2) return [];
      try {
        const r = await fetchJson<GeoSearchResponse>(`/api/v1/geo/search?q=${encodeURIComponent(s)}&lang=${locale}`, 6000, signal);
        if (r.results?.length) return r.results;
        return staticSearch(s);
      } catch {
        return staticSearch(s);
      }
    },
    [locale],
  );

  const value = useMemo<LocationState>(
    () => ({
      device,
      focus: pinned ? DEMO_POINT : focus,
      placeName: pinned ? demoName : placeName,
      permission,
      loading,
      error,
      custom: pinned ? true : custom,
      pinned,
      ready,
      resolved: pinned || resolved,
      needsPlace: !pinned && needsPlace && !resolved,
      accuracyM: pinned ? null : accuracyM,
      setFocus,
      resetFocus,
      refresh,
      search,
    }),
    [device, focus, placeName, demoName, permission, loading, error, custom, pinned, ready, resolved, needsPlace, accuracyM, setFocus, resetFocus, refresh, search],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocation(): LocationState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLocation must be used inside LocationProvider');
  return v;
}
