'use client';
/** Cooling goals on the server (prompt-v1 §6.6). Guests: create throws GuestRestrictedError; drafts are allowed. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, call } from '@/lib/api/client';

import type { Goal, GoalTaskItem, LatLng } from '../types';
import { useDataContext } from './context';
import { getJSON, shouldRetry } from './http';
import { API } from './heat';
import { invalidate, qk } from './keys';

export type CreateGoalInput = {
  zone: { id: string; name?: string; centroid?: LatLng; h3?: string[] };
  target_c: number;
  by_date: string;
  team_id?: string | null;
  org_id?: string | null;
};
export type UpdateGoalInput = { id: string; patch: Partial<Pick<Goal, 'target_c' | 'by_date' | 'team_id' | 'status'>> };

const newClientId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Newest active goal, else the newest one. */
export function activeGoal(goals: readonly Goal[]): Goal | null {
  return goals.find((g) => (g.status ?? 'active') === 'active' && g.progress_pct < 100) ?? goals[0] ?? null;
}

export function useCreateGoal() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Goal, Error, CreateGoalInput>({
    mutationFn: async (input) =>
      (await call(
        api.POST('/api/v1/goals', {
          body: { zone_id: input.zone.id, target_c: input.target_c, by_date: input.by_date, team_id: input.team_id ?? null, client_id: newClientId(), lang: ctx.lang },
        }),
      )) as unknown as Goal,
    onSuccess: () => void invalidate.goals(qc, ctx.ns),
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Goal, Error, UpdateGoalInput>({
    mutationFn: async ({ id, patch }) => (await call(api.PATCH('/api/v1/goals/{goal_id}', { params: { path: { goal_id: id } }, body: patch }))) as unknown as Goal,
    onSuccess: () => void invalidate.goals(qc, ctx.ns),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => void (await call(api.DELETE('/api/v1/goals/{goal_id}', { params: { path: { goal_id: id } } }))),
    onSuccess: () => void invalidate.goals(qc, ctx.ns),
  });
}

function useGoalsQuery() {
  const ctx = useDataContext();
  return useQuery<Goal[]>({
    queryKey: qk.goals(ctx.ns),
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: ({ signal }) => (ctx.kind === 'guest' ? Promise.resolve([]) : getJSON<Goal[]>(`${API}/goals/mine`, { lang: ctx.lang }, signal)),
  });
}

/**
 * Goals (yours and your teams'), newest first, plus `active` and the create/update/remove
 * mutations, so screens can write `useGoals().create.mutate(...)`.
 */
export function useGoals() {
  const query = useGoalsQuery();
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
    retry: shouldRetry,
    queryFn: ({ signal }) => (ctx.kind === 'guest' ? Promise.resolve([]) : getJSON<Goal[]>(`${API}/goals/mine`, { lang: ctx.lang }, signal)),
    select: activeGoal,
  });
}

export function useGoalTasks(goalId: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<GoalTaskItem[]>({
    queryKey: [...qk.goals(ctx.ns), 'tasks', goalId ?? ''],
    enabled: ctx.ready && !!goalId && ctx.kind !== 'guest',
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<GoalTaskItem[]>(`${API}/goals/${encodeURIComponent(goalId!)}/tasks`, undefined, signal),
  });
}

export function useUpdateTask(goalId: string) {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<GoalTaskItem, Error, { id: string; status?: GoalTaskItem['status'] }>({
    mutationFn: async ({ id, status }) =>
      (await call(api.PATCH('/api/v1/goals/{goal_id}/tasks/{task_id}', { params: { path: { goal_id: goalId, task_id: id } }, body: { status } }))) as unknown as GoalTaskItem,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...qk.goals(ctx.ns), 'tasks', goalId] }),
  });
}

export type GoalDraft = { zone_id: string; target_c: number; by_date: string };
const DRAFT_KEY = 'atmos:goal-draft:v1';

/** Guests draft a goal (G5): kept in this browser and on the server, so it survives sign-up. */
export async function saveGoalDraft(d: GoalDraft): Promise<void> {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // storage unavailable
  }
  await call(api.POST('/api/v1/goal-drafts', { body: { payload: d } })).catch(() => undefined);
}

export function readGoalDraft(): GoalDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as GoalDraft) : null;
  } catch {
    return null;
  }
}

export function clearGoalDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // storage unavailable
  }
}
