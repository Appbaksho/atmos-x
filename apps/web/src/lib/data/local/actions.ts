/**
 * Action logging (prompt-v0.md §5.4): resize photo → AI verify → store → points → goal progress →
 * notifications → trees. Network and image work are injected so the flow is testable.
 */
import { DataError, RateLimitedError } from '../errors';
import type { LatLng } from '../types';
import type { ActionLog, LogActionInput, Tree, VerifyPhotoRequest, VerifyPhotoResult } from './v0-types';
import type { DataContext } from './context';
import { applyCooling } from './goals';
import { assertAccount } from './guest';
import { newId } from './ids';
import { pushNotification } from './notifications';
import { scoreAction } from './points';
import { COLL, putPhoto, readList, updateList, type LocalGoal, type Namespace } from './store';
import { addTrees } from './trees';

/** Extra inputs the v0 hook accepts on top of the contract's LogActionInput. */
export type LogActionExtra = {
  /** plant_tree: species of the new tree(s) */
  species_id?: string;
  /** plant_tree: nickname (numbered when quantity > 1) */
  nickname?: string;
  zone_label?: string | null;
  /** Zone centroid for the GPS check; defaults to the goal's zone */
  target?: LatLng | null;
};

export type PreparedPhoto = { stored: Blob; preview: string };

export type LogActionDeps = {
  verify: (req: VerifyPhotoRequest) => Promise<VerifyPhotoResult>;
  /** ≤ 1600 px JPEG blob to store + ≤ 768 px data URL for the AI */
  prepare: (photo: Blob) => Promise<PreparedPhoto>;
};

export type LogActionResult = { log: ActionLog; trees: Tree[]; milestones: number[] };

/** Max trees auto-created from one plant_tree log (bigger plantings are tracked as one log). */
export const MAX_TREES_PER_LOG = 20;

export async function listActions(ns: Namespace): Promise<ActionLog[]> {
  const all = await readList<ActionLog>(ns, COLL.actions);
  return [...all].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getAction(ns: Namespace, id: string): Promise<ActionLog | null> {
  return (await readList<ActionLog>(ns, COLL.actions)).find((a) => a.id === id) ?? null;
}

function unverified(reason_code: string): VerifyPhotoResult {
  return { status: 'pending', confidence: 0, seen: '', reason_code };
}

export async function logAction(ctx: DataContext, input: LogActionInput & LogActionExtra, deps: LogActionDeps): Promise<LogActionResult> {
  assertAccount(ctx.kind, 'log_action');
  const score = scoreAction(input.action_type, input.quantity);
  const id = newId('a');
  const goals = await readList<LocalGoal>(ctx.ns, COLL.goals);
  const goal = input.goal_id ? goals.find((g) => g.id === input.goal_id) ?? null : null;

  // 1. photo: store ≤ 1600 px, send ≤ 768 px to the AI
  let photo_url: string | null = null;
  let verification: VerifyPhotoResult | null = null;
  if (input.photo) {
    const prepared = await deps.prepare(input.photo);
    photo_url = await putPhoto(ctx.ns, id, prepared.stored);
    try {
      verification = await deps.verify({
        image: prepared.preview,
        action_type: input.action_type,
        quantity: Math.max(1, Math.round(input.quantity)),
        taken_at: input.taken_at,
        lat: input.lat,
        lng: input.lng,
        target: input.target ?? goal?.zone_centroid ?? null,
        lang: ctx.lang,
      });
    } catch (e) {
      if (e instanceof DataError && e.code === 'auth.guest_restricted') throw e;
      verification = unverified(e instanceof RateLimitedError ? 'rate_limited' : 'unavailable');
    }
  } else {
    verification = unverified('no_photo');
  }

  const log: ActionLog = {
    id,
    action_type: input.action_type,
    quantity: Math.max(1, Math.round(input.quantity)),
    ...score,
    status: verification.status,
    photo_url,
    lat: input.lat,
    lng: input.lng,
    taken_at: input.taken_at,
    goal_id: goal?.id ?? null,
    team_id: input.team_id ?? goal?.team_id ?? null,
    zone_label: input.zone_label ?? goal?.zone_name ?? null,
    note: input.note ?? null,
    verification,
    created_at: new Date().toISOString(),
  };
  await updateList<ActionLog>(ctx.ns, COLL.actions, (l) => [log, ...l]);

  // 2. goal progress (verified actions only) + milestones
  let milestones: number[] = [];
  if (goal && log.status === 'verified' && log.cooling_c > 0) {
    await updateList<LocalGoal>(ctx.ns, COLL.goals, (l) =>
      l.map((g) => {
        if (g.id !== goal.id) return g;
        const r = applyCooling(g, log.cooling_c);
        milestones = r.crossed;
        return r.goal;
      }),
    );
  }

  // 3. notifications
  await pushNotification(ctx.ns, {
    kind: 'verification',
    title: {
      code: log.status === 'verified' ? 'notif.verification.verified' : 'notif.verification.pending',
      params: { action: log.action_type, qty: log.quantity, points: log.points },
    },
    body: log.status === 'verified'
      ? { code: 'notif.verification.verified_body', params: { seen: verification.seen } }
      : { code: 'notif.verification.pending_body', params: { reason: verification.reason_code } },
    screen: 'S15',
    params: { id: log.id },
  });
  for (const pct of milestones) {
    await pushNotification(ctx.ns, {
      kind: 'goal_progress',
      title: { code: 'notif.goal.milestone', params: { pct, zone: goal?.zone_name ?? '' } },
      body: null,
      screen: 'S10',
      params: { goal_id: goal?.id ?? '' },
    });
  }

  // 4. trees
  let trees: Tree[] = [];
  if (log.action_type === 'plant_tree') {
    const n = Math.min(log.quantity, MAX_TREES_PER_LOG);
    const base = input.nickname?.trim() ?? '';
    trees = await addTrees(
      ctx,
      Array.from({ length: n }, (_, i) => ({
        species_id: input.species_id ?? 'unknown',
        nickname: base && n > 1 ? `${base} ${i + 1}` : base,
        planted_at: input.taken_at,
        location: input.lat !== null && input.lng !== null ? { lat: input.lat, lng: input.lng } : null,
        photo_url,
      })),
    );
  }

  return { log, trees, milestones };
}

/** "A teammate can confirm it": mark a pending action verified (v0: confirmed on this device). */
export async function confirmAction(ctx: DataContext, id: string): Promise<ActionLog> {
  assertAccount(ctx.kind, 'log_action');
  let out: ActionLog | undefined;
  await updateList<ActionLog>(ctx.ns, COLL.actions, (l) =>
    l.map((a) => {
      if (a.id !== id || a.status !== 'pending') return a;
      out = { ...a, status: 'verified', verification: { ...(a.verification ?? unverified('confirmed')), status: 'verified', reason_code: 'teammate_confirmed' } };
      return out;
    }),
  );
  if (!out) throw new DataError('action.not_pending', 'This action is not waiting for confirmation', 409);
  if (out.goal_id && out.cooling_c > 0) {
    const log = out;
    await updateList<LocalGoal>(ctx.ns, COLL.goals, (l) => l.map((g) => (g.id === log.goal_id ? applyCooling(g, log.cooling_c).goal : g)));
  }
  return out;
}
