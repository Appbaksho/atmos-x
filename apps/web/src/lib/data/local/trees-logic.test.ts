import { beforeEach, describe, expect, it } from 'vitest';

import { buildDemoData } from './demo';
import { listNotifications, treeDueNotifications } from './notifications';
import { freshStore, guestCtx, userCtx } from './test-helpers';
import { addTrees, getTree, listTrees, recordCheck } from './trees';
import { daysUntilDue, nextDueAt, PHOTO_EVERY_DAYS, treeStatus, withStatus } from './trees-logic';

const DAY = 864e5;
const T0 = Date.UTC(2026, 9, 6, 12);
const iso = (ms: number) => new Date(ms).toISOString();

describe('tree due logic', () => {
  it('next due = last check + 15 days', () => {
    expect(PHOTO_EVERY_DAYS).toBe(15);
    expect(nextDueAt(iso(T0))).toBe(iso(T0 + 15 * DAY));
  });

  it('ok / due (≤ 2 days) / overdue', () => {
    expect(treeStatus(iso(T0 + 3 * DAY), T0)).toBe('ok');
    expect(treeStatus(iso(T0 + 2 * DAY), T0)).toBe('due');
    expect(treeStatus(iso(T0 + 1), T0)).toBe('due');
    expect(treeStatus(iso(T0), T0)).toBe('due');
    expect(treeStatus(iso(T0 - 1), T0)).toBe('overdue');
  });

  it('days until due rounds toward "sooner"', () => {
    expect(daysUntilDue(iso(T0 + 3 * 3600e3), T0)).toBe(1);
    expect(daysUntilDue(iso(T0 + 15 * DAY), T0)).toBe(15);
    expect(daysUntilDue(iso(T0 - 3 * DAY), T0)).toBe(-3);
  });

  it('withStatus uses the last check, else the planting date', () => {
    const base = { id: 't', species_id: 'neem', nickname: '', location: null, next_due_at: '', status: 'ok' as const, health: 'healthy' as const, photo_url: null };
    const planted = withStatus({ ...base, planted_at: iso(T0 - 16 * DAY), last_check_at: null }, T0);
    expect(planted.status).toBe('overdue');
    const checked = withStatus({ ...base, planted_at: iso(T0 - 16 * DAY), last_check_at: iso(T0 - 1 * DAY) }, T0);
    expect(checked.status).toBe('ok');
    expect(checked.next_due_at).toBe(iso(T0 + 14 * DAY));
  });

  it("Nadia's story has 4 trees with exactly 1 due for a photo", () => {
    const d = buildDemoData(T0);
    expect(d.trees).toHaveLength(4);
    expect(d.trees.filter((t) => t.status !== 'ok').map((t) => t.nickname)).toEqual(['Beguni']);
    expect(treeDueNotifications(d.trees, T0)).toHaveLength(1);
  });
});

describe('tree store', () => {
  beforeEach(freshStore);

  it('a check resets the clock, stores health and earns points', async () => {
    const ctx = userCtx();
    const [t] = await addTrees(ctx, [{ species_id: 'neem', location: null, planted_at: iso(Date.now() - 20 * DAY) }]);
    expect((await listTrees(ctx.ns))[0].status).toBe('overdue');
    const check = await recordCheck(ctx, {
      tree_id: t.id,
      photo_url: 'https://example.com/p.jpg',
      ai: { health: 'stressed', confidence: 0.8, tip: 'Water twice a week', seen: 'Yellowing leaves' },
    });
    expect(check.points).toBe(5);
    const after = await getTree(ctx.ns, t.id);
    expect(after?.status).toBe('ok');
    expect(after?.health).toBe('stressed');
    expect(after?.checks).toHaveLength(1);
    expect((await listNotifications(ctx, await listTrees(ctx.ns))).filter((n) => n.kind === 'tree_due')).toHaveLength(0);
  });

  it('tree ids look like ATX-YY-XXXX', async () => {
    const [t] = await addTrees(userCtx(), [{ species_id: 'neem', location: null }]);
    expect(t.id).toMatch(/^ATX-\d{2}-[2-9A-HJ-KM-NP-Z]{4}$/);
  });

  it('guests cannot track trees', async () => {
    await expect(addTrees(guestCtx(), [{ species_id: 'neem', location: null }])).rejects.toMatchObject({ code: 'auth.guest_restricted' });
  });
});
