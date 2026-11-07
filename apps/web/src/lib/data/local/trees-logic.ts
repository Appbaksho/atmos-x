/**
 * Tree photo-check rules (ported from apps/mobile/src/lib/cz/demo.ts + screens/profile/trees-common.ts):
 * every tree needs a photo every 15 days. next due = last check (or planting) + 15 days.
 * Status: overdue when past due, due when ≤ 2 days left, otherwise ok.
 */
import type { Tree, TreeStatus } from './v0-types';
import { DAY_MS } from './ids';

export const PHOTO_EVERY_DAYS = 15;
export const DUE_SOON_DAYS = 2;

export function nextDueAt(lastCheckOrPlanted: string): string {
  return new Date(new Date(lastCheckOrPlanted).getTime() + PHOTO_EVERY_DAYS * DAY_MS).toISOString();
}

/** Whole days until the next photo (negative = overdue). Uses ceil so "due in 3 h" is 1 day, not 0. */
export function daysUntilDue(next_due_at: string, now: number = Date.now()): number {
  const ms = new Date(next_due_at).getTime() - now;
  return ms >= 0 ? Math.ceil(ms / DAY_MS) : -Math.ceil(-ms / DAY_MS);
}

export function treeStatus(next_due_at: string, now: number = Date.now()): TreeStatus {
  const ms = new Date(next_due_at).getTime() - now;
  if (ms < 0) return 'overdue';
  if (ms <= DUE_SOON_DAYS * DAY_MS) return 'due';
  return 'ok';
}

/** Recompute derived fields (next due + status) at read time. */
export function withStatus(t: Tree, now: number = Date.now()): Tree {
  const next = nextDueAt(t.last_check_at ?? t.planted_at);
  return { ...t, next_due_at: next, status: treeStatus(next, now) };
}

export function needsPhoto(t: Tree): boolean {
  return t.status !== 'ok' && t.health !== 'dead';
}
