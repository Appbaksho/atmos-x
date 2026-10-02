import * as Location from 'expo-location';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { DHAKA, LatLng } from '@/lib/geo';

type LocationState = {
  /** Device location (falls back to Dhaka if permission is denied) */
  device: LatLng;
  /** The point currently being analysed (device location or a picked spot) */
  focus: LatLng;
  placeName: string | null;
  permission: 'unknown' | 'granted' | 'denied';
  loading: boolean;
  setFocus: (p: LatLng) => void;
  resetFocus: () => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<LocationState | null>(null);

async function reverse(p: LatLng): Promise<string | null> {
  try {
    const [r] = await Location.reverseGeocodeAsync(p);
    if (!r) return null;
    return [r.district || r.subregion || r.name, r.city || r.region].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}

type Fix = { permission: 'granted' | 'denied'; position: LatLng | null };

async function getFix(): Promise<Fix> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { permission: 'denied', position: null };
    const last = await Location.getLastKnownPositionAsync();
    const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { permission: 'granted', position: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } };
  } catch {
    return { permission: 'denied', position: null };
  }
}

/**
 * `autoStart`: request permission and a fix as soon as it is true. Onboarding keeps it false so the
 * permission explainer (S03) is shown before the system prompt; it calls `refresh()` itself.
 */
export function LocationProvider({ children, autoStart = true }: { children: React.ReactNode; autoStart?: boolean }) {
  const [device, setDevice] = useState<LatLng>(DHAKA);
  const [focus, setFocusState] = useState<LatLng>(DHAKA);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [permission, setPermission] = useState<LocationState['permission']>('unknown');
  const [loading, setLoading] = useState(autoStart);
  const [custom, setCustom] = useState(false);

  const apply = useCallback(
    (fix: Fix) => {
      setPermission(fix.permission);
      if (fix.position) {
        const p = fix.position;
        setDevice(p);
        if (!custom) {
          setFocusState(p);
          reverse(p).then(setPlaceName);
        }
      }
      setLoading(false);
    },
    [custom],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    apply(await getFix());
  }, [apply]);

  useEffect(() => {
    if (!autoStart) return;
    let alive = true;
    getFix().then((fix) => alive && apply(fix));
    return () => {
      alive = false;
    };
    // run once autoStart turns on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const setFocus = useCallback((p: LatLng) => {
    setCustom(true);
    setFocusState(p);
    setPlaceName(null);
    reverse(p).then(setPlaceName);
  }, []);

  const resetFocus = useCallback(() => {
    setCustom(false);
    setFocusState(device);
    setPlaceName(null);
    reverse(device).then(setPlaceName);
  }, [device]);

  return (
    <Ctx.Provider
      value={{
        device,
        focus,
        placeName,
        permission,
        loading,
        setFocus,
        resetFocus,
        refresh,
      }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLocation() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLocation must be used inside LocationProvider');
  return v;
}
