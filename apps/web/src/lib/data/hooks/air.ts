'use client';
/** Air quality and your own sensors (prompt-v1 §7.8). Sensors are real devices; nothing is simulated. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, call } from '@/lib/api/client';

import type { Air, LatLng, NewSensor, Sensor } from '../types';
import { cachePolicy, useDataContext } from './context';
import { getJSON, shouldRetry } from './http';
import { API } from './heat';
import { qk } from './keys';

/** PM2.5 + AQI for a point; `my_sensors` are the signed-in user's devices. Refreshes every 5 min. */
export function useAir(point: LatLng | null | undefined) {
  const ctx = useDataContext();
  return useQuery<Air>({
    queryKey: qk.air(ctx.ns, point ?? { lat: 0, lng: 0 }),
    enabled: ctx.ready && !!point,
    retry: shouldRetry,
    refetchInterval: 5 * 60 * 1000,
    ...cachePolicy(ctx),
    queryFn: ({ signal }) => getJSON<Air>(`${API}/air`, { lat: point!.lat, lng: point!.lng }, signal),
  });
}

/** The user's sensors (guests: []). The argument is accepted for compatibility and ignored. */
export function useSensors(_basePm25?: number | null) {
  void _basePm25;
  const ctx = useDataContext();
  return useQuery<Sensor[]>({
    queryKey: qk.sensors(ctx.ns),
    enabled: ctx.ready,
    refetchInterval: 60 * 1000,
    queryFn: async ({ signal }) => (ctx.kind === 'guest' ? [] : getJSON<Sensor[]>(`${API}/sensors/mine`, undefined, signal)),
  });
}

export type SensorInput = { name: string; model?: string | null; location?: LatLng | null };

function useSensorMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<R, Error, V>({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.sensors(ctx.ns) });
      void qc.invalidateQueries({ queryKey: ['atmos', 'local', ctx.ns, 'air'] });
    },
  });
}

/** Returns the new sensor with its ingest token, shown once. Guests: GuestRestrictedError. */
export function useAddSensor() {
  return useSensorMutation(
    async (input: SensorInput) =>
      (await call(
        api.POST('/api/v1/sensors', { body: { name: input.name, model: input.model ?? null, lat: input.location?.lat ?? null, lng: input.location?.lng ?? null } }),
      )) as unknown as NewSensor,
  );
}

export function useRemoveSensor() {
  return useSensorMutation(async (id: string) => {
    await call(api.DELETE('/api/v1/sensors/{sensor_id}', { params: { path: { sensor_id: id } } }));
  });
}
