'use client';
/** Tracked trees and 15-day photo checks with the AI health verdict. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { DataError } from '../errors';
import { currentContext } from '../local/context';
import { assertAccount } from '../local/guest';
import { newId } from '../local/ids';
import { preparePhoto } from '../local/images';
import { putPhoto } from '../local/store';
import { addTrees, getTree, listTrees, recordCheck, removeTree, updateTree, type AddTreeInput } from '../local/trees';
import type { Tree, TreeCheck, TreeCheckRequest, TreeCheckResult, TreeHealth } from '../types';
import { V0_ROUTES } from '../types';
import { useDataContext } from './context';
import { postJSON } from './http';
import { invalidate, qk } from './keys';

export { PHOTO_EVERY_DAYS, DUE_SOON_DAYS, daysUntilDue, treeStatus, needsPhoto } from '../local/trees-logic';

/** Trees sorted by next photo due (status recomputed on read). Guests get []. */
export function useTrees() {
  const ctx = useDataContext();
  return useQuery<Tree[]>({
    queryKey: qk.trees(ctx.ns),
    enabled: ctx.ready,
    queryFn: async () => listTrees((await currentContext()).ns),
  });
}

/** One tree with its checks (newest first). */
export function useTree(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<Tree | null>({
    queryKey: qk.tree(ctx.ns, id ?? ''),
    enabled: ctx.ready && !!id,
    queryFn: async () => getTree((await currentContext()).ns, id!),
  });
}

/** Add a tree by hand (S20 "Add tree"). Guests: GuestRestrictedError. */
export function useAddTree() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Tree, Error, AddTreeInput>({
    mutationFn: async (input) => (await addTrees(await currentContext(), [input]))[0],
    onSuccess: () => void invalidate.afterTreeCheck(qc, ctx.ns),
  });
}

export function useUpdateTree() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<void, Error, { id: string; patch: Partial<Pick<Tree, 'nickname' | 'species_id' | 'location' | 'health'>> }>({
    mutationFn: async ({ id, patch }) => updateTree(await currentContext(), id, patch),
    onSuccess: () => void invalidate.afterTreeCheck(qc, ctx.ns),
  });
}

export function useRemoveTree() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => removeTree(await currentContext(), id),
    onSuccess: () => void invalidate.afterTreeCheck(qc, ctx.ns),
  });
}

export type TreeCheckInput = { tree_id: string; photo: Blob | null; note?: string | null; health?: TreeHealth };

/**
 * Add a photo check: resize, ask the AI for a health verdict (POST /tree-check), store the check and
 * reset the 15-day clock. If the AI is unavailable the check is stored with `ai: null` and the given
 * (or previous) health. Earns TREE_CHECK_POINTS. Guests: GuestRestrictedError.
 */
export function useTreeCheck() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<TreeCheck, Error, TreeCheckInput>({
    mutationFn: async (input) => {
      const c = await currentContext();
      assertAccount(c.kind, 'trees');
      const tree = await getTree(c.ns, input.tree_id);
      if (!tree) throw new DataError('tree.not_found', 'Tree not found', 404);
      let photo_url: string | null = null;
      let ai: TreeCheckResult | null = null;
      if (input.photo) {
        const prepared = await preparePhoto(input.photo);
        photo_url = await putPhoto(c.ns, newId('tc'), prepared.stored);
        try {
          const req: TreeCheckRequest = { image: prepared.preview, species_id: tree.species_id, lang: c.lang };
          ai = await postJSON<TreeCheckResult>(V0_ROUTES.treeCheck.path, req);
        } catch {
          ai = null;
        }
      }
      return recordCheck(c, { tree_id: input.tree_id, photo_url, health: input.health, note: input.note, ai });
    },
    onSuccess: () => void invalidate.afterTreeCheck(qc, ctx.ns),
  });
}
