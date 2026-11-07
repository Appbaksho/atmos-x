'use client';
/**
 * Actions on the server (prompt-v1 §7.11): POST /actions runs deterministic checks and computes
 * points; anything that fails a check waits for a teammate or moderator review (never the owner).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, call, postForm } from '@/lib/api/client';

import { resizeToBlob } from '../local/images';
import type { ActionLog, LogActionInput, LogActionResult } from '../types';
import { useDataContext } from './context';
import { getJSON, shouldRetry } from './http';
import { API } from './heat';
import { invalidate, qk } from './keys';

export { ACTION_TYPES, ACTION_BY_ID, scoreAction, levelFor } from '../local/points';
export type { LogActionResult };

/** PT2: points for an on-time 15-day check-in photo (pending until the tree's 90-day check-in). */
export const TREE_CHECK_POINTS = 10;

/** Matches the API's photo limit. */
const MAX_UPLOAD = 8 * 1024 * 1024;
const RAW_OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const newClientId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/**
 * In-app camera shots are re-encoded to ≤ 1600 px. Gallery files go up untouched when they fit, so
 * the server can read their EXIF time and GPS for the capture check (it strips EXIF from copies).
 */
export async function photoForUpload(photo: Blob, source: 'camera' | 'upload'): Promise<Blob> {
  if (source === 'upload' && photo.size <= MAX_UPLOAD && RAW_OK.has(photo.type)) return photo;
  return resizeToBlob(photo);
}

export function useActions() {
  const ctx = useDataContext();
  return useQuery<ActionLog[]>({
    queryKey: qk.actions(ctx.ns),
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: ({ signal }) => (ctx.kind === 'guest' ? Promise.resolve([]) : getJSON<ActionLog[]>(`${API}/actions/mine`, { limit: 100 }, signal)),
  });
}

/** One action (contribution card, S15). */
export function useAction(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<ActionLog | null>({
    queryKey: qk.action(ctx.ns, id ?? ''),
    enabled: ctx.ready && !!id,
    retry: shouldRetry,
    queryFn: async ({ signal }) => (await call(api.GET('/api/v1/actions/{action_id}', { params: { path: { action_id: id! } }, signal }))) as unknown as ActionLog,
  });
}

/** Pending actions the viewer may confirm (teammates', or everyone's for moderators). */
export function useReviewQueue() {
  const ctx = useDataContext();
  return useQuery<ActionLog[]>({
    queryKey: [...qk.actions(ctx.ns), 'review-queue'],
    enabled: ctx.ready && ctx.kind !== 'guest',
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<ActionLog[]>(`${API}/actions/review-queue`, {}, signal),
  });
}

/**
 * Log an action: the photo goes to the server with GPS, time and capture source; the server checks
 * it, stores it, awards points (pending until unlock) and creates trees for plant_tree.
 * Guests: GuestRestrictedError.
 */
export function useLogAction() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<LogActionResult, Error, LogActionInput>({
    mutationFn: async (input) => {
      const form = new FormData();
      const source = input.capture_source ?? 'camera';
      const put = (k: string, v: string | number | null | undefined) => {
        if (v !== null && v !== undefined && v !== '') form.set(k, String(v));
      };
      put('action_type', input.action_type);
      put('quantity', input.quantity);
      put('lat', input.lat);
      put('lng', input.lng);
      put('accuracy_m', input.accuracy_m);
      put('taken_at', input.taken_at);
      put('capture_source', source);
      put('goal_id', input.goal_id);
      put('team_id', input.team_id);
      put('species_id', input.species_id);
      put('nickname', input.nickname);
      put('note', input.note);
      put('client_id', newClientId());
      if (input.photo) form.set('photo', await photoForUpload(input.photo, source), 'photo.jpg');
      return postForm<LogActionResult>(`${API}/actions`, form);
    },
    onSuccess: () => void invalidate.afterAction(qc, ctx.ns),
  });
}

/** Confirm or reject someone else's pending action (reviewer ≠ owner; the server enforces it). */
export function useReviewAction() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<ActionLog, Error, { id: string; approve: boolean; note?: string | null }>({
    mutationFn: async ({ id, approve, note }) =>
      (await call(api.POST('/api/v1/actions/{action_id}/review', { params: { path: { action_id: id } }, body: { approve, note: note ?? null } }))) as unknown as ActionLog,
    onSuccess: () => void invalidate.afterAction(qc, ctx.ns),
  });
}
