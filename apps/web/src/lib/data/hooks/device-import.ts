'use client';
/** A9: offer to bring a V0 device's data into the account once, then clear it from the device. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, call, postForm } from '@/lib/api/client';

import { clearImported, collectDeviceData } from '../local/device-import';
import { useDataContext } from './context';
import { API } from './heat';
import { qk } from './keys';

export type ImportCounts = { goals: number; drafts: number; trees: number; actions: number; checks: number; fields: number; photos: number; skipped: number };

const KEY = ['atmos', 'local', 'device-import'] as const;

/** `{count}` of importable items on this device, or null (nothing to import, already imported, or a guest). */
export function useDeviceImportOffer() {
  const ctx = useDataContext();
  return useQuery<{ count: number } | null>({
    queryKey: [...KEY, ctx.ns],
    enabled: ctx.ready && ctx.kind !== 'guest' && !ctx.presentation && !ctx.offline,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const prof = await call(api.GET('/api/v1/me/profile', { signal }));
      if (prof.imported_at) return null;
      const b = await collectDeviceData();
      return b ? { count: b.count } : null;
    },
  });
}

export function useDeviceImport() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<ImportCounts, Error, void>({
    mutationFn: async () => {
      const b = await collectDeviceData();
      if (!b) return { goals: 0, drafts: 0, trees: 0, actions: 0, checks: 0, fields: 0, photos: 0, skipped: 0 };
      const form = new FormData();
      form.set('payload', JSON.stringify(b.payload));
      form.set('lang', ctx.lang);
      for (const [k, blob] of b.photos) form.append(`photo:${k}`, blob, `${k}.jpg`);
      const res = await postForm<ImportCounts>(`${API}/me/import`, form);
      await clearImported(b);
      return res;
    },
    onSuccess: () => {
      qc.setQueryData([...KEY, ctx.ns], null);
      void qc.invalidateQueries({ queryKey: qk.local(ctx.ns) });
    },
  });
}
