'use client';
/** Farmer alerts (server) and saved fields (local). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { currentContext } from '../local/context';
import { addField, listFields, removeField, updateField, type FieldInput } from '../local/farm';
import type { CropId, FarmAlertsResponse, FarmField, LatLng, StageId } from '../types';
import { V0_ROUTES } from '../types';
import { cachePolicy, useDataContext } from './context';
import { getJSON, shouldRetry } from './http';
import { qk } from './keys';

export type FarmAlertsInput = { location: LatLng; crop: CropId; stage: StageId };

/** Works for guests too (alerts without saving a field). `null` disables. */
export function useFarmAlerts(input: FarmAlertsInput | null | undefined) {
  const ctx = useDataContext();
  const p = input?.location ?? { lat: 0, lng: 0 };
  return useQuery<FarmAlertsResponse>({
    queryKey: qk.farmAlerts(p, input?.crop ?? '', input?.stage ?? '', ctx.lang),
    enabled: ctx.ready && !!input,
    retry: shouldRetry,
    ...cachePolicy(ctx),
    queryFn: ({ signal }) =>
      getJSON<FarmAlertsResponse>(V0_ROUTES.farmAlerts.path, { lat: p.lat, lng: p.lng, crop: input!.crop, stage: input!.stage, lang: ctx.lang }, signal),
  });
}

/** Saved fields (guests get []). */
export function useFields() {
  const ctx = useDataContext();
  return useQuery<FarmField[]>({
    queryKey: qk.fields(ctx.ns),
    enabled: ctx.ready,
    queryFn: async () => listFields(await currentContext()),
  });
}

function useFieldMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<R, Error, V>({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.fields(ctx.ns) }),
  });
}

/** Guests: throws GuestRestrictedError. */
export function useAddField() {
  return useFieldMutation(async (input: FieldInput) => addField(await currentContext(), input));
}

export function useUpdateField() {
  return useFieldMutation(async ({ id, patch }: { id: string; patch: Partial<FieldInput> }) => updateField(await currentContext(), id, patch));
}

export function useRemoveField() {
  return useFieldMutation(async (id: string) => removeField(await currentContext(), id));
}
