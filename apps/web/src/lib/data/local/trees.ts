/** Tracked trees and their 15-day photo checks. */
import { DataError } from '../errors';
import type { LatLng, TreeHealth } from '../types';
import type { Tree, TreeCheck, TreeCheckResult } from './v0-types';
import type { DataContext } from './context';
import { assertAccount } from './guest';
import { newId } from './ids';
import { TREE_CHECK_POINTS } from './points';
import { COLL, readList, updateList, type Namespace } from './store';
import { CODE_ALPHABET } from './teams-logic';
import { withStatus } from './trees-logic';

/** Tree tag like `ATX-26-7KQ4` (year + 4 unambiguous chars). */
export function newTreeId(now = new Date()): string {
  const yy = String(now.getFullYear()).slice(-2);
  const tail = newId().replace(/-/g, '');
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[parseInt(tail.slice(i * 2, i * 2 + 2), 16) % CODE_ALPHABET.length];
  return `ATX-${yy}-${s}`;
}

export async function listTrees(ns: Namespace, now: number = Date.now()): Promise<Tree[]> {
  const trees = await readList<Tree>(ns, COLL.trees);
  return trees.map((t) => withStatus(t, now)).sort((a, b) => a.next_due_at.localeCompare(b.next_due_at));
}

export async function getTree(ns: Namespace, id: string, now: number = Date.now()): Promise<Tree | null> {
  const [trees, checks] = await Promise.all([readList<Tree>(ns, COLL.trees), readList<TreeCheck>(ns, COLL.checks)]);
  const t = trees.find((x) => x.id === id);
  if (!t) return null;
  return {
    ...withStatus(t, now),
    checks: checks.filter((c) => c.tree_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

export async function listChecks(ns: Namespace): Promise<TreeCheck[]> {
  return readList<TreeCheck>(ns, COLL.checks);
}

export type AddTreeInput = {
  species_id: string;
  nickname?: string;
  planted_at?: string;
  location: LatLng | null;
  photo_url?: string | null;
};

export async function addTrees(ctx: DataContext, inputs: readonly AddTreeInput[]): Promise<Tree[]> {
  assertAccount(ctx.kind, 'trees');
  const now = new Date();
  const created: Tree[] = inputs.map((i) => {
    const planted_at = i.planted_at ?? now.toISOString();
    return withStatus({
      id: newTreeId(now),
      species_id: i.species_id,
      nickname: i.nickname?.trim() ?? '',
      planted_at,
      location: i.location,
      // the planting photo counts as the first photo
      last_check_at: i.photo_url ? planted_at : null,
      next_due_at: '',
      status: 'ok',
      health: 'healthy',
      photo_url: i.photo_url ?? null,
    });
  });
  await updateList<Tree>(ctx.ns, COLL.trees, (l) => [...created, ...l]);
  return created;
}

export async function updateTree(ctx: DataContext, id: string, patch: Partial<Pick<Tree, 'nickname' | 'species_id' | 'location' | 'health'>>): Promise<void> {
  assertAccount(ctx.kind, 'trees');
  await updateList<Tree>(ctx.ns, COLL.trees, (l) => l.map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

export async function removeTree(ctx: DataContext, id: string): Promise<void> {
  assertAccount(ctx.kind, 'trees');
  await updateList<Tree>(ctx.ns, COLL.trees, (l) => l.filter((t) => t.id !== id));
}

export type RecordCheckInput = {
  tree_id: string;
  photo_url: string | null;
  /** Manual health when the AI is unavailable; the AI verdict wins when present. */
  health?: TreeHealth;
  note?: string | null;
  ai?: TreeCheckResult | null;
};

export async function recordCheck(ctx: DataContext, input: RecordCheckInput): Promise<TreeCheck> {
  assertAccount(ctx.kind, 'trees');
  const trees = await readList<Tree>(ctx.ns, COLL.trees);
  const tree = trees.find((t) => t.id === input.tree_id);
  if (!tree) throw new DataError('tree.not_found', 'Tree not found', 404);
  const created_at = new Date().toISOString();
  const health = input.ai?.health ?? input.health ?? tree.health;
  const check: TreeCheck = {
    id: newId('c'),
    tree_id: tree.id,
    photo_url: input.photo_url,
    health,
    note: input.note ?? null,
    ai: input.ai ?? null,
    points: input.photo_url ? TREE_CHECK_POINTS : 0,
    created_at,
  };
  await updateList<TreeCheck>(ctx.ns, COLL.checks, (l) => [check, ...l]);
  await updateList<Tree>(ctx.ns, COLL.trees, (l) =>
    l.map((t) =>
      t.id === tree.id
        ? withStatus({ ...t, health, last_check_at: input.photo_url ? created_at : t.last_check_at, photo_url: input.photo_url ?? t.photo_url })
        : t,
    ),
  );
  return check;
}
