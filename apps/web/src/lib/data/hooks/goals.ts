'use client';
/** Cooling goals (local). Guests: mutations throw GuestRestrictedError. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { currentContext } from '../local/context';
import { activeGoal, createGoal, deleteGoal, listGoals, updateGoal, type CreateGoalInput } from '../local/goals';
import type { Goal } from '../types';
import { useDataContext } from './context';
import { invalidate, qk } from './keys';

export type { CreateGoalInput };
export type UpdateGoalInput = { id: string; patch: Partial<Pick<Goal, 'target_c' | 'by_date' | 'team_id' | 'org_id'>> };

export function useCreateGoal() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Goal, Error, CreateGoalInput>({
    mutationFn: async (input) => createGoal(await currentContext(), input),
    onSuccess: () => void invalidate.goals(qc, ctx.ns),
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Goal, Error, UpdateGoalInput>({
    mutationFn: async ({ id, patch }) => updateGoal(await currentContext(), id, patch),
    onSuccess: () => void invalidate.goals(qc, ctx.ns),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => deleteGoal(await currentContext(), id),
    onSuccess: () => void invalidate.goals(qc, ctx.ns),
  });
}

/**
 * Goals, newest first, plus `active` (newest unfinished) and the create/update/remove mutations,
 * so screens can write `useGoals().create.mutate(...)`.
 */
export function useGoals() {
  const ctx = useDataContext();
  const query = useQuery<Goal[]>({
    queryKey: qk.goals(ctx.ns),
    enabled: ctx.ready,
    queryFn: async () => listGoals((await currentContext()).ns),
  });
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const remove = useDeleteGoal();
  return Object.assign(query, { active: activeGoal(query.data ?? []), create, update, remove });
}

/** Just the active goal (null when none). */
export function useActiveGoal() {
  const ctx = useDataContext();
  return useQuery<Goal[], Error, Goal | null>({
    queryKey: qk.goals(ctx.ns),
    enabled: ctx.ready,
    queryFn: async () => listGoals((await currentContext()).ns),
    select: activeGoal,
  });
}
