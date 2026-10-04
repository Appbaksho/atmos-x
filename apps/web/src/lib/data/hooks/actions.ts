'use client';
/** Logged actions + the log-action flow (§5.4). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { confirmAction, getAction, listActions, logAction, type LogActionExtra, type LogActionResult } from '../local/actions';
import { currentContext } from '../local/context';
import { preparePhoto } from '../local/images';
import type { ActionLog, LogActionInput, VerifyPhotoRequest, VerifyPhotoResult } from '../types';
import { V0_ROUTES } from '../types';
import { useDataContext } from './context';
import { postJSON } from './http';
import { invalidate, qk } from './keys';

export { ACTION_TYPES, ACTION_BY_ID, scoreAction, levelFor, badgesFor, TREE_CHECK_POINTS } from '../local/points';
export type { LogActionExtra, LogActionResult };

export function useActions() {
  const ctx = useDataContext();
  return useQuery<ActionLog[]>({
    queryKey: qk.actions(ctx.ns),
    enabled: ctx.ready,
    queryFn: async () => listActions((await currentContext()).ns),
  });
}

/** One action (contribution card, S15). */
export function useAction(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<ActionLog | null>({
    queryKey: qk.action(ctx.ns, id ?? ''),
    enabled: ctx.ready && !!id,
    queryFn: async () => getAction((await currentContext()).ns, id!),
  });
}

export const verifyPhoto = (req: VerifyPhotoRequest) => postJSON<VerifyPhotoResult>(V0_ROUTES.verifyPhoto.path, req);

/**
 * Log an action: resize the photo (≤ 1600 px blob stored, ≤ 768 px sent to the AI), verify it,
 * store the log with the returned status, score points (pending = provisional), update the goal,
 * create notifications, and create Tree(s) for plant_tree (pass `species_id`, optional `nickname`).
 * If verification fails or is unavailable the action is stored as pending. Guests: GuestRestrictedError.
 */
export function useLogAction() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<LogActionResult, Error, LogActionInput & LogActionExtra>({
    mutationFn: async (input) => logAction(await currentContext(), input, { verify: verifyPhoto, prepare: preparePhoto }),
    onSuccess: () => void invalidate.afterAction(qc, ctx.ns),
  });
}

/** Mark a pending action verified ("a teammate can confirm it"). */
export function useConfirmAction() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<ActionLog, Error, string>({
    mutationFn: async (id) => confirmAction(await currentContext(), id),
    onSuccess: () => void invalidate.afterAction(qc, ctx.ns),
  });
}
