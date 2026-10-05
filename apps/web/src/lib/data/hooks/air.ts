'use client';
/** Air quality (server) merged with the user's simulated sensors (local). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { currentContext } from '../local/context';
import { addSensor, listSensors, removeSensor, SENSOR_INTERVAL_MS, type SensorInput } from '../local/farm';
import type { Air, LatLng, Sensor, SensorSummary } from '../types';
import { V0_ROUTES } from '../types';
import { cachePolicy, useDataContext } from './context';
import { getJSON, shouldRetry } from './http';
import { qk } from './keys';

const summary = (s: Sensor): SensorSummary => ({ id: s.id, name: s.name, pm25: s.pm25, last_seen: s.last_seen, online: s.online, simulated: s.simulated });

/** PM2.5 + AQI for a point; `my_sensors` is filled from this device (simulated, refreshed every 5 min). */
export function useAir(point: LatLng | null | undefined) {
  const ctx = useDataContext();
  return useQuery<Air>({
    queryKey: qk.air(ctx.ns, point ?? { lat: 0, lng: 0 }),
    enabled: ctx.ready && !!point,
    retry: shouldRetry,
    refetchInterval: SENSOR_INTERVAL_MS,
    ...cachePolicy(ctx),
    queryFn: async ({ signal }) => {
      const air = await getJSON<Air>(V0_ROUTES.air.path, { lat: point!.lat, lng: point!.lng }, signal);
      const sensors = await listSensors(await currentContext(), air.pm25);
      return { ...air, my_sensors: sensors.map(summary) };
    },
  });
}

/**
 * The user's sensors. Pass the area PM2.5 (e.g. useAir().data?.pm25) to get simulated readings;
 * without it readings are null. Guests get [].
 */
export function useSensors(basePm25?: number | null) {
  const ctx = useDataContext();
  return useQuery<Sensor[]>({
    queryKey: [...qk.sensors(ctx.ns), basePm25 ?? null],
    enabled: ctx.ready,
    refetchInterval: basePm25 == null ? false : SENSOR_INTERVAL_MS,
    queryFn: async () => listSensors(await currentContext(), basePm25 ?? null),
  });
}

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

/** Guests: throws GuestRestrictedError. */
export function useAddSensor() {
  return useSensorMutation(async (input: SensorInput) => addSensor(await currentContext(), input));
}

export function useRemoveSensor() {
  return useSensorMutation(async (id: string) => removeSensor(await currentContext(), id));
}
