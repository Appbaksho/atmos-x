'use client';
/**
 * Web push (prompt-v1 §6.13 W2): the server's VAPID config, this browser's subscription, and
 * turning push on or off. The service worker (public/sw.js) shows what the server sends.
 * Off when the server has no VAPID keys; guests can't subscribe (A7).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { DataError } from '../errors';
import { useDataContext } from './context';
import { getJSON, postJSON, shouldRetry } from './http';
import { API } from './heat';

export type PushConfig = { enabled: boolean; public_key: string | null; quiet_hours: { from: number; to: number } };
export type PushState = 'unsupported' | 'disabled' | 'denied' | 'off' | 'on';

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export function usePushConfig() {
  return useQuery<PushConfig>({
    queryKey: ['atmos', 'server', 'push-config'],
    retry: shouldRetry,
    staleTime: 30 * 60_000,
    queryFn: ({ signal }) => getJSON<PushConfig>(`${API}/push/config`, undefined, signal),
  });
}

/** This browser's push state for the signed-in person. */
export function usePushState(config: PushConfig | undefined) {
  const ctx = useDataContext();
  return useQuery<PushState>({
    queryKey: ['atmos', 'local', ctx.ns, 'push-state', !!config?.enabled],
    enabled: ctx.ready && !!config,
    queryFn: async () => {
      if (!pushSupported()) return 'unsupported';
      if (!config?.enabled) return 'disabled';
      if (Notification.permission === 'denied') return 'denied';
      const reg = await registration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      return sub && Notification.permission === 'granted' ? 'on' : 'off';
    },
  });
}

export function useTogglePush(config: PushConfig | undefined) {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<PushState, Error, boolean>({
    mutationFn: async (on) => {
      const reg = await registration();
      if (!on) {
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        await sub?.unsubscribe().catch(() => false);
        await postJSON(`${API}/push/unsubscribe`, { endpoint: sub?.endpoint ?? null });
        return 'off';
      }
      if (!config?.enabled || !config.public_key) throw new DataError('push.unavailable', 'Push is not set up', 503);
      if (!reg) throw new DataError('push.no_worker', 'Install the app or reload to receive push', 0);
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new DataError('push.denied', 'Notifications are blocked', 0);
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.public_key) }));
      const json = sub.toJSON() as { endpoint: string; keys?: { p256dh: string; auth: string } };
      await postJSON(`${API}/push/subscribe`, { endpoint: json.endpoint, keys: json.keys, tz_offset_min: -new Date().getTimezoneOffset() });
      return 'on';
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['atmos', 'local', ctx.ns, 'push-state'] }),
  });
}
