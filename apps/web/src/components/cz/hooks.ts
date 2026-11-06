'use client';
/** Small browser hooks shared by the kit and shell. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

const noop = () => () => {};

let scrollLocks = 0;
let overflowBeforeLock = '';

/**
 * Lock page scrolling under an overlay; returns the release function. Ref-counted, so stacked
 * overlays (the Ask sheet + its camera) can close in any order without leaving the page locked.
 */
export function lockBodyScroll(): () => void {
  if (scrollLocks++ === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--scrollLocks === 0) document.body.style.overflow = overflowBeforeLock;
  };
}

/** True after hydration (false during SSR and the hydration render). */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** navigator.onLine as state (true on the server). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** matchMedia as state (false on the server). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** ≥ 1024 px: sidebar layout, right-hand drawers. */
export function useDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

/** Debounced copy of a value (sliders → refetch). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Short vibration for primary actions (expo-haptics replacement). Silently ignored where unsupported. */
export function haptic(ms = 10) {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    // Chrome only allows vibration after a real user gesture; skip programmatic clicks quietly.
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate(ms);
  } catch {
    // not allowed (iOS, no user gesture)
  }
}
