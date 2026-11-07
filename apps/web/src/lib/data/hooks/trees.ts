'use client';
/** My trees on the server (prompt-v1 §6.7 T1–T6): states, timeline, 15-day check-ins, invites. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, call, postForm } from '@/lib/api/client';

import type { LatLng, Tree, TreeHealth, TreeInvite } from '../types';
import { photoForUpload } from './actions';
import { useDataContext } from './context';
import { getJSON, shouldRetry } from './http';
import { API } from './heat';
import { invalidate, qk } from './keys';

/** Check-ins are every 15 days; "due" starts 2 days before (server config, T3). */
export const PHOTO_EVERY_DAYS = 15;
export const DUE_SOON_DAYS = 2;

/** Whole days until the next check-in (negative = overdue). */
export function daysUntilDue(nextDueAt: string, now: number = Date.now()): number {
  return Math.round((Date.parse(nextDueAt) - now) / 864e5);
}

const newClientId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** My trees, soonest check-in first (state derived on the server). Guests get []. */
export function useTrees() {
  const ctx = useDataContext();
  return useQuery<Tree[]>({
    queryKey: qk.trees(ctx.ns),
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: ({ signal }) => (ctx.kind === 'guest' ? Promise.resolve([]) : getJSON<Tree[]>(`${API}/trees/mine`, {}, signal)),
  });
}

/** Friends' trees I was invited to help water. */
export function useHelpingTrees() {
  const ctx = useDataContext();
  return useQuery<Tree[]>({
    queryKey: [...qk.trees(ctx.ns), 'helping'],
    enabled: ctx.ready && ctx.kind !== 'guest',
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<Tree[]>(`${API}/trees/helping`, {}, signal),
  });
}

/** One tree with its check-ins (newest first) and care tips. */
export function useTree(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<Tree | null>({
    queryKey: qk.tree(ctx.ns, id ?? ''),
    enabled: ctx.ready && !!id && ctx.kind !== 'guest',
    retry: shouldRetry,
    queryFn: async ({ signal }) => (await call(api.GET('/api/v1/trees/{tree_id}', { params: { path: { tree_id: id! } }, signal }))) as unknown as Tree,
  });
}

export type AddTreeInput = { species_id: string; nickname?: string; planted_at?: string; location: LatLng | null; photo?: Blob | null };

/** Track a tree by hand (no planting action, so no planting points). Guests: GuestRestrictedError. */
export function useAddTree() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Tree, Error, AddTreeInput>({
    mutationFn: async (input) => {
      const form = new FormData();
      form.set('species_id', input.species_id);
      if (input.nickname) form.set('nickname', input.nickname);
      if (input.planted_at) form.set('planted_at', input.planted_at);
      if (input.location) {
        form.set('lat', String(input.location.lat));
        form.set('lng', String(input.location.lng));
      }
      form.set('client_id', newClientId());
      if (input.photo) form.set('photo', await photoForUpload(input.photo, 'camera'), 'photo.jpg');
      return postForm<Tree>(`${API}/trees`, form);
    },
    onSuccess: () => void invalidate.afterTreeCheck(qc, ctx.ns),
  });
}

export type TreePatch = { nickname?: string; species_id?: string; lost_confirmed?: boolean };

export function useUpdateTree() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Tree, Error, { id: string; patch: TreePatch }>({
    mutationFn: async ({ id, patch }) => (await call(api.PATCH('/api/v1/trees/{tree_id}', { params: { path: { tree_id: id } }, body: patch }))) as unknown as Tree,
    onSuccess: () => void invalidate.afterTreeCheck(qc, ctx.ns),
  });
}

/** Remove a tree. Its points are revoked (PT10). */
export function useRemoveTree() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => void (await call(api.DELETE('/api/v1/trees/{tree_id}', { params: { path: { tree_id: id } } }))),
    onSuccess: () => void invalidate.afterAction(qc, ctx.ns),
  });
}

export type TreeCheckInput = { tree_id: string; photo: Blob | null; health: TreeHealth; height_cm?: number | null; note?: string | null; location?: LatLng | null };

/**
 * Check-in (T6): photo + own health report + optional height. The server runs deterministic checks,
 * resets the 15-day clock, awards PT2 when on time and the 90-day/1-year milestones.
 */
export function useTreeCheck() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Tree, Error, TreeCheckInput>({
    mutationFn: async (input) => {
      const form = new FormData();
      form.set('health', input.health);
      if (input.height_cm != null) form.set('height_cm', String(input.height_cm));
      if (input.note) form.set('note', input.note);
      if (input.location) {
        form.set('lat', String(input.location.lat));
        form.set('lng', String(input.location.lng));
      }
      if (input.photo) form.set('photo', await photoForUpload(input.photo, 'camera'), 'photo.jpg');
      return postForm<Tree>(`${API}/trees/${encodeURIComponent(input.tree_id)}/checks`, form);
    },
    onSuccess: (tree) => {
      qc.setQueryData(qk.tree(ctx.ns, tree.id), tree);
      void invalidate.afterTreeCheck(qc, ctx.ns);
    },
  });
}

/** A signed link a friend opens to help water this tree (T5). */
export function useTreeInvite() {
  return useMutation<TreeInvite, Error, string>({
    mutationFn: async (id) => (await call(api.POST('/api/v1/trees/{tree_id}/invite', { params: { path: { tree_id: id } } }))) as unknown as TreeInvite,
  });
}

export function useAcceptTreeInvite() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Tree, Error, string>({
    mutationFn: async (token) => (await call(api.POST('/api/v1/trees/invites/accept', { body: { token } }))) as unknown as Tree,
    onSuccess: () => void invalidate.afterTreeCheck(qc, ctx.ns),
  });
}

/** A check-in photo is due or overdue (lost trees don't ask for one). */
export function needsPhoto(tree: Pick<Tree, 'status' | 'state'>): boolean {
  return tree.status !== 'ok' && tree.state !== 'lost';
}
