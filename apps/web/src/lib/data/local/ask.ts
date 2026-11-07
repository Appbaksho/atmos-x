/** Ask Atmos client-side pieces: daily usage counter and the compact client_state (§5.2). */
import type { AskClientState, Goal, Unit } from '../types';
import type { Tree } from './v0-types';
import type { DataContext } from './context';
import { consumeAsk, remainingAsks, type AskUsage, type ProfileKind } from './guest';
import { dayKey } from './ids';
import { COLL, readValue, updateValue } from './store';

export async function askRemaining(ctx: DataContext, now: Date = new Date()): Promise<number> {
  return remainingAsks(ctx.kind, await readValue<AskUsage>(ctx.ns, COLL.askUsage), now);
}

/** Consumes one message or throws GuestRestricted (guest at 5) / RateLimited (account at 30). */
export async function consumeAskQuota(ctx: DataContext, now: Date = new Date()): Promise<number> {
  const next = await updateValue<AskUsage>(ctx.ns, COLL.askUsage, (cur) => consumeAsk(ctx.kind, cur, now));
  return remainingAsks(ctx.kind, next, now);
}

/** Align the local counter with the server's `remaining_today` (the server also enforces). */
export async function syncAskRemaining(ctx: DataContext, serverRemaining: number, limit: number, now: Date = new Date()): Promise<void> {
  const local = await askRemaining(ctx, now);
  if (serverRemaining >= local) return;
  await updateValue<AskUsage>(ctx.ns, COLL.askUsage, () => ({ day: dayKey(now), count: Math.max(0, limit - serverRemaining) }));
}

export const CLIENT_STATE_MAX_BYTES = 6 * 1024;

const byteLength = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/**
 * Compact summary sent with every Ask message: profile kind, units, farmer mode, the user's trees
 * and active goal, plus what the current screen shows (`visible`). Trimmed to ≤ 6 KB: long strings
 * in `visible` are cut, then `visible` keys are dropped from the end, then trees.
 */
export function buildClientState(input: {
  kind: ProfileKind;
  unit: Unit;
  farmer: boolean;
  trees?: readonly Tree[];
  goal?: Goal | null;
  visible?: Record<string, unknown>;
}): AskClientState {
  const state: AskClientState = {
    profile: input.kind,
    units: input.unit,
    farmer: input.farmer,
    trees: (input.trees ?? []).slice(0, 20).map((t) => ({
      id: t.id,
      nickname: t.nickname,
      species_id: t.species_id,
      status: t.status,
      health: t.health,
      next_due_at: t.next_due_at,
    })),
    goal: input.goal
      ? { zone_name: input.goal.zone_name, target_c: input.goal.target_c, by_date: input.goal.by_date, progress_pct: input.goal.progress_pct }
      : null,
  };
  if (input.visible) {
    state.visible = JSON.parse(
      JSON.stringify(input.visible, (_k, v: unknown) => (typeof v === 'string' && v.length > 400 ? `${v.slice(0, 400)}…` : v)),
    ) as Record<string, unknown>;
  }
  if (byteLength(state) <= CLIENT_STATE_MAX_BYTES) return state;

  if (state.visible) {
    const keys = Object.keys(state.visible);
    while (keys.length && byteLength(state) > CLIENT_STATE_MAX_BYTES) {
      delete state.visible[keys.pop() as string];
    }
    if (!Object.keys(state.visible).length) delete state.visible;
  }
  while (state.trees && state.trees.length && byteLength(state) > CLIENT_STATE_MAX_BYTES) state.trees.pop();
  return state;
}
