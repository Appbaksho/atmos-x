/**
 * A9: collect a V0 device's IndexedDB data (goals, actions, trees, checks, fields, photos) for
 * POST /me/import. Every namespace except `demo` (Presentation mode) is read; simulated sensors are
 * never sent. After a successful upload the collections now served by the API are cleared.
 */
import type { FarmField, LatLng } from '../types';
import { getKV } from './kv';
import { PHOTO_KEY_PREFIX, type LocalGoal } from './store';
import type { ActionLog, Tree, TreeCheck } from './v0-types';

/** Collections that moved to the server; cleared after import. */
const MOVED = ['goals', 'actions', 'trees', 'checks', 'fields'] as const;
const MAX_PHOTOS = 60;

type GoalItem = { id: string; zone_centroid: LatLng | null; zone_name: string | null; target_c: number; by_date: string };
type ActionItem = { id: string; action_type: string; quantity: number; lat: number | null; lng: number | null; taken_at: string | null; note: string | null; zone_label: string | null; photo_key: string | null; created_at: string };
type TreeItem = { id: string; species_id: string; nickname: string; planted_at: string; location: LatLng | null; photo_key: string | null; action_id: string | null };
type CheckItem = { id: string; tree_id: string; health: string; note: string | null; photo_key: string | null; created_at: string };
type FieldItem = { id: string; name: string; crop: string; stage: string; location: LatLng; area: number | null };

export type ImportPayload = { goals: GoalItem[]; actions: ActionItem[]; trees: TreeItem[]; checks: CheckItem[]; fields: FieldItem[] };
export type ImportBundle = { payload: ImportPayload; photos: Map<string, Blob>; namespaces: string[]; count: number };

async function namespaces(): Promise<string[]> {
  const kv = await getKV();
  const out = new Set<string>();
  for (const k of await kv.keys()) {
    const m = /^((?:user:[^:]+)|guest):(goals|actions|trees|checks|fields)$/.exec(k);
    if (m) out.add(m[1]);
  }
  return [...out];
}

/** Everything importable on this device, or null when there is nothing. */
export async function collectDeviceData(): Promise<ImportBundle | null> {
  const kv = await getKV();
  const nss = await namespaces();
  const payload: ImportPayload = { goals: [], actions: [], trees: [], checks: [], fields: [] };
  const photos = new Map<string, Blob>();
  const keyFor = new Map<string, string>();

  const photoKey = async (url: string | null | undefined): Promise<string | null> => {
    if (!url || !url.startsWith(PHOTO_KEY_PREFIX)) return null;
    const idbKey = url.slice(PHOTO_KEY_PREFIX.length);
    const known = keyFor.get(idbKey);
    if (known) return known;
    if (photos.size >= MAX_PHOTOS) return null;
    const blob = await kv.get<Blob>(idbKey);
    if (!blob) return null;
    const k = `k${photos.size}`;
    photos.set(k, blob);
    keyFor.set(idbKey, k);
    return k;
  };

  for (const ns of nss) {
    const goals = (await kv.get<LocalGoal[]>(`${ns}:goals`)) ?? [];
    for (const g of goals) {
      if (!g?.id || typeof g.target_c !== 'number' || !g.by_date) continue;
      payload.goals.push({ id: g.id, zone_centroid: g.zone_centroid ?? null, zone_name: g.zone_name ?? null, target_c: g.target_c, by_date: g.by_date.slice(0, 10) });
    }
    const actions = [...((await kv.get<ActionLog[]>(`${ns}:actions`)) ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const a of actions) {
      if (!a?.id) continue;
      payload.actions.push({
        id: a.id,
        action_type: a.action_type,
        quantity: a.quantity,
        lat: a.lat,
        lng: a.lng,
        taken_at: a.taken_at,
        note: a.note,
        zone_label: a.zone_label,
        photo_key: await photoKey(a.photo_url),
        created_at: a.created_at,
      });
    }
    const trees = (await kv.get<Tree[]>(`${ns}:trees`)) ?? [];
    for (const t of trees) {
      if (!t?.id) continue;
      // V0 created a planting's trees with the action's photo and time: link them back to it.
      const from = actions.find((a) => a.action_type === 'plant_tree' && a.taken_at === t.planted_at && (a.photo_url ?? null) === (t.photo_url ?? null));
      payload.trees.push({
        id: t.id,
        species_id: t.species_id,
        nickname: t.nickname ?? '',
        planted_at: t.planted_at,
        location: t.location,
        photo_key: await photoKey(t.photo_url),
        action_id: from?.id ?? null,
      });
    }
    const checks = (await kv.get<TreeCheck[]>(`${ns}:checks`)) ?? [];
    for (const c of checks) {
      if (!c?.id) continue;
      payload.checks.push({ id: c.id, tree_id: c.tree_id, health: c.health, note: c.note, photo_key: await photoKey(c.photo_url), created_at: c.created_at });
    }
    const fields = (await kv.get<FarmField[]>(`${ns}:fields`)) ?? [];
    for (const f of fields) {
      if (!f?.id || !f.location) continue;
      payload.fields.push({ id: f.id, name: f.name, crop: f.crop, stage: f.stage, location: f.location, area: f.area ?? null });
    }
  }
  const count = payload.goals.length + payload.actions.length + payload.trees.length + payload.checks.length + payload.fields.length;
  return count ? { payload, photos, namespaces: nss, count } : null;
}

/** Remove the imported collections (and their photos) from this device. */
export async function clearImported(bundle: ImportBundle): Promise<void> {
  const kv = await getKV();
  const all = await kv.keys();
  for (const ns of bundle.namespaces) {
    for (const name of MOVED) await kv.del(`${ns}:${name}`);
    await Promise.all(all.filter((k) => k.startsWith(`${ns}:photo:`)).map((k) => kv.del(k)));
  }
}
