'use client';
/** Registers /sw.js in production builds only; unregisters stale workers in development. */
import { useEffect } from 'react';

export function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'production') {
      // The build stamp in the URL makes each deploy install a new worker with fresh cache names.
      const v = encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID || 'dev');
      navigator.serviceWorker.register(`/sw.js?v=${v}`, { scope: '/', updateViaCache: 'none' }).catch(() => {});
    } else {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    }
  }, []);
  return null;
}
