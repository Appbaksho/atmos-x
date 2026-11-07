'use client';
/**
 * The hex scan for the current focus point (composes useLocation + prefs + useZones). Shared by
 * Home (own zone, hottest zones), the Map and onboarding. Guests are clamped to 500 m so a passive
 * read never trips the account sheet.
 */
import { useLocation } from '@/lib/location';
import { GUEST_MAX_RADIUS_M, useSession, useZones } from '@/lib/data/hooks';
import type { LatLng } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';

/** The point being analysed, once the persisted focus is restored (null before). */
export function useFocusPoint(): LatLng | null {
  const { focus, ready } = useLocation();
  return ready ? focus : null;
}

export function clampRadius(r: number, guest: boolean): number {
  const v = Math.max(100, Math.min(1000, Math.round(r || 200)));
  return guest ? Math.min(v, GUEST_MAX_RADIUS_M) : v;
}

export function useScan(radius?: number, enabled = true) {
  const { prefs, ready } = useCz();
  const session = useSession();
  const point = useFocusPoint();
  const r = clampRadius(radius ?? prefs.radius_m, session.isGuest);
  const q = useZones(enabled && ready && session.ready ? point : null, r);
  return Object.assign(q, { point, radius: r, guest: session.isGuest });
}
