/**
 * Notifications: stored events (verification results, goal milestones, heat warnings, team joins)
 * plus derived ones (tree photo due/overdue), computed at read time. Guests get none (§4.5).
 * Titles/bodies are I18nText codes under the `server` namespace: notif.*.
 */
import type { AppNotification, Conditions } from '../types';
import type { Tree } from './v0-types';
import type { DataContext } from './context';
import { DAY_MS, dayKey, newId } from './ids';
import { COLL, readList, readValue, updateList, updateValue, writeValue, type Namespace } from './store';
import { daysUntilDue, DUE_SOON_DAYS } from './trees-logic';

export type NewNotification = Omit<AppNotification, 'id' | 'read' | 'created_at'> & { id?: string };

const MAX_STORED = 100;

export async function pushNotification(ns: Namespace, n: NewNotification): Promise<AppNotification> {
  const full: AppNotification = { ...n, id: n.id ?? newId('n'), read: false, created_at: new Date().toISOString() };
  await updateList<AppNotification>(ns, COLL.notifications, (l) => [full, ...l.filter((x) => x.id !== full.id)].slice(0, MAX_STORED));
  return full;
}

/** Derived "photo due" notifications (stable ids so read state sticks per due date). */
export function treeDueNotifications(trees: readonly Tree[], now: number = Date.now()): AppNotification[] {
  return trees
    .filter((t) => t.status !== 'ok' && t.health !== 'dead')
    .map((t) => {
      const days = daysUntilDue(t.next_due_at, now);
      const overdue = t.status === 'overdue';
      const dueMs = new Date(t.next_due_at).getTime();
      return {
        id: `tree_due:${t.id}:${t.next_due_at.slice(0, 10)}`,
        kind: 'tree_due' as const,
        title: { code: overdue ? 'notif.tree.overdue' : 'notif.tree.due', params: { name: t.nickname || t.species_id, days: Math.abs(days) } },
        body: { code: 'notif.tree.rule', params: { every: 15 } },
        screen: 'S20' as const,
        params: { tree_id: t.id },
        read: false,
        created_at: new Date(overdue ? dueMs : dueMs - DUE_SOON_DAYS * DAY_MS).toISOString(),
      };
    });
}

export async function listNotifications(ctx: DataContext, trees: readonly Tree[], now: number = Date.now()): Promise<AppNotification[]> {
  if (ctx.kind === 'guest') return [];
  const [stored, readIds] = await Promise.all([
    readList<AppNotification>(ctx.ns, COLL.notifications),
    readValue<string[]>(ctx.ns, COLL.notifRead),
  ]);
  const readSet = new Set(readIds ?? []);
  return [...stored, ...treeDueNotifications(trees, now)]
    .map((n) => (readSet.has(n.id) ? { ...n, read: true } : n))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function markNotificationsRead(ctx: DataContext, ids: readonly string[]): Promise<void> {
  if (ctx.kind === 'guest' || !ids.length) return;
  await updateList<AppNotification>(ctx.ns, COLL.notifications, (l) => l.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
  await updateValue<string[]>(ctx.ns, COLL.notifRead, (cur) => [...new Set([...(cur ?? []), ...ids])].slice(-500));
}

const HEAT_LEVELS = new Set(['moderate', 'severe', 'very_severe']);

/** True when Conditions warrant a heat notification (BMD moderate+, danger bands, or warnings). */
export function isHeatWarning(c: Pick<Conditions, 'bmd_level' | 'heat_risk' | 'warnings'>): boolean {
  return (c.bmd_level !== null && HEAT_LEVELS.has(c.bmd_level)) || c.heat_risk === 'danger' || c.heat_risk === 'xdanger' || c.warnings.length > 0;
}

/** At most one heat notification per day per namespace. */
export async function maybeNotifyHeat(ctx: DataContext, c: Conditions): Promise<boolean> {
  if (ctx.kind === 'guest' || !isHeatWarning(c)) return false;
  const today = dayKey();
  if ((await readValue<string>(ctx.ns, COLL.heatNotified)) === today) return false;
  await writeValue(ctx.ns, COLL.heatNotified, today);
  await pushNotification(ctx.ns, {
    kind: 'heat_warning',
    title: { code: 'notif.heat.warning', params: { level: c.bmd_level ?? c.heat_risk, place: c.place, feels: Math.round(c.feels_c) } },
    body: c.warnings[0]?.text ?? null,
    screen: 'S04',
  });
  return true;
}
