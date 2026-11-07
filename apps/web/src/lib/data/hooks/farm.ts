'use client';
/** Farmer alerts and saved fields on the server (prompt-v1 §7.9). Guests see alerts by place, crop and stage. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, call } from '@/lib/api/client';

import type { CropId, FarmAlertsResponse, FarmField, LatLng, StageId } from '../types';
import { cachePolicy, useDataContext } from './context';
import { getJSON, shouldRetry } from './http';
import { API } from './heat';
import { qk } from './keys';

export type FarmAlertsInput = { location: LatLng; crop: CropId; stage: StageId; field_id?: string | null };
export type FieldInput = { name: string; crop: CropId; stage: StageId; location: LatLng; area?: number | null };

const newClientId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Works for guests too (alerts without saving a field). `null` disables. A saved field's id adds "done". */
export function useFarmAlerts(input: FarmAlertsInput | null | undefined) {
  const ctx = useDataContext();
  const p = input?.location ?? { lat: 0, lng: 0 };
  const fieldId = ctx.kind !== 'guest' ? input?.field_id ?? null : null;
  return useQuery<FarmAlertsResponse>({
    queryKey: [...qk.farmAlerts(p, input?.crop ?? '', input?.stage ?? '', ctx.lang), fieldId],
    enabled: ctx.ready && !!input,
    retry: shouldRetry,
    ...cachePolicy(ctx),
    queryFn: ({ signal }) =>
      getJSON<FarmAlertsResponse>(`${API}/farm/alerts`, fieldId ? { field_id: fieldId } : { lat: p.lat, lng: p.lng, crop: input!.crop, stage: input!.stage }, signal),
  });
}

/** "I've done it" on an alert (stored per person). Guests: GuestRestrictedError. */
export function useMarkAlertDone() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; field_id?: string | null }>({
    mutationFn: async ({ id, field_id }) => void (await call(api.POST('/api/v1/farm/alerts/{alert_id}/done', { params: { path: { alert_id: id } }, body: { field_id: field_id ?? null } }))),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['atmos', 'server', 'farm-alerts'] }),
  });
}

/** Saved fields (guests get []). */
export function useFields() {
  const ctx = useDataContext();
  return useQuery<FarmField[]>({
    queryKey: qk.fields(ctx.ns),
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: ({ signal }) => (ctx.kind === 'guest' ? Promise.resolve([]) : getJSON<FarmField[]>(`${API}/farm/fields`, {}, signal)),
  });
}

function useFieldMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<R, Error, V>({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.fields(ctx.ns) });
      void qc.invalidateQueries({ queryKey: ['atmos', 'server', 'farm-alerts'] });
    },
  });
}

/** Guests: throws GuestRestrictedError. */
export function useAddField() {
  return useFieldMutation(
    async (input: FieldInput) =>
      (await call(api.POST('/api/v1/farm/fields', { body: { ...input, area: input.area ?? null, client_id: newClientId() } }))) as unknown as FarmField,
  );
}

export function useUpdateField() {
  return useFieldMutation(
    async ({ id, patch }: { id: string; patch: Partial<FieldInput> }) =>
      (await call(api.PATCH('/api/v1/farm/fields/{field_id}', { params: { path: { field_id: id } }, body: patch }))) as unknown as FarmField,
  );
}

export function useRemoveField() {
  return useFieldMutation(async (id: string) => void (await call(api.DELETE('/api/v1/farm/fields/{field_id}', { params: { path: { field_id: id } } }))));
}
