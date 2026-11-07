/**
 * Presentation mode (prompt-v0.md §5.5): Nadia's story loaded into the separate "demo" namespace.
 * Seeded on the first switch; "Reset demo" clears and reloads it. The user's own data stays in
 * `user:<id>` untouched. Story dates are relative to load time, so "1 tree due" holds on the day.
 */
import { DEMO_NAMESPACE, STORY } from '../seed';
import type { AppNotification, FarmField, Sensor } from '../types';
import type { ActionLog, Tree, TreeCheck } from './v0-types';
import { DAY_MS } from './ids';
import { COLL, clearNamespace, readValue, writeList, writeValue, type LocalGoal, type LocalProfile, type Membership } from './store';
import { withStatus } from './trees-logic';

const ago = (now: number, days: number, hour = 10) => {
  const d = new Date(now - days * DAY_MS);
  if (days > 0) d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export function buildDemoData(now: number = Date.now()) {
  const s = STORY;
  const goal: LocalGoal = {
    id: s.goal.id,
    zone_id: s.goal.zone_id,
    zone_name: s.goal.zone_name,
    zone_centroid: s.goal.zone_centroid,
    zone_area_km2: s.goal.zone_area_km2,
    target_c: s.goal.target_c,
    by_date: s.goal.by_date,
    progress_pct: s.goal.progress_pct,
    modeled_c: s.goal.modeled_c,
    team_id: s.goal.team_id,
    org_id: s.goal.org_id,
    created_at: ago(now, s.goal.created_days_ago),
  };
  const actions: ActionLog[] = s.actions.map((a) => {
    const created_at = ago(now, a.days_ago, 9 + (a.quantity % 7));
    return {
      id: a.id,
      action_type: a.action_type,
      quantity: a.quantity,
      points: a.points,
      cooling_c: a.cooling_c,
      trees: a.trees,
      status: a.status,
      photo_url: a.photo_url,
      lat: a.lat,
      lng: a.lng,
      taken_at: created_at,
      goal_id: a.goal_id,
      team_id: a.team_id,
      zone_label: a.zone_label,
      note: a.note,
      verification: a.photo_url ? a.verification : null,
      created_at,
    };
  });
  const trees: Tree[] = s.trees.map((t) =>
    withStatus(
      {
        id: t.id,
        species_id: t.species_id,
        nickname: t.nickname,
        planted_at: ago(now, t.planted_days_ago),
        location: t.location,
        last_check_at: t.last_check_days_ago === null ? null : ago(now, t.last_check_days_ago),
        next_due_at: '',
        status: 'ok',
        health: t.health,
        photo_url: t.photo_url,
      },
      now,
    ),
  );
  const checks: TreeCheck[] = s.checks.map((c) => ({
    id: c.id,
    tree_id: c.tree_id,
    photo_url: c.photo_url,
    health: c.health,
    note: c.note,
    ai: null,
    points: c.points,
    created_at: ago(now, c.days_ago),
  }));
  const memberships: Membership[] = s.memberships.map((m) => ({ team_id: m.team_id, role: m.role, joined_at: ago(now, m.joined_days_ago) }));
  const fields: FarmField[] = s.fields.map((f) => ({
    id: f.id,
    name: f.name,
    crop: f.crop,
    stage: f.stage,
    location: f.location,
    area: f.area,
    created_at: ago(now, f.created_days_ago),
  }));
  const sensors: Sensor[] = s.sensors.map((x) => ({
    id: x.id,
    name: x.name,
    model: x.model,
    location: x.location,
    pm25: null,
    last_seen: null,
    online: true,
    simulated: true,
    created_at: ago(now, x.created_days_ago),
  }));
  const notifications: AppNotification[] = s.notifications.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    screen: n.screen,
    params: n.params,
    read: n.read,
    created_at: ago(now, n.days_ago),
  }));
  const profile: LocalProfile = { display_name: s.user.display_name, home: s.profile.home, avatar_url: null };
  return { goal, actions, trees, checks, memberships, fields, sensors, notifications, profile };
}

export async function seedDemo(now: number = Date.now()): Promise<void> {
  const ns = DEMO_NAMESPACE;
  const d = buildDemoData(now);
  await Promise.all([
    writeList(ns, COLL.goals, [d.goal]),
    writeList(ns, COLL.actions, d.actions),
    writeList(ns, COLL.trees, d.trees),
    writeList(ns, COLL.checks, d.checks),
    writeList(ns, COLL.memberships, d.memberships),
    writeList(ns, COLL.teams, []),
    writeList(ns, COLL.fields, d.fields),
    writeList(ns, COLL.sensors, d.sensors),
    writeList(ns, COLL.notifications, d.notifications),
    writeValue(ns, COLL.profile, d.profile),
  ]);
  await writeValue(ns, COLL.seededAt, new Date(now).toISOString());
}

let seeding: Promise<void> | null = null;

/** Loads the story into the demo namespace if it is not there yet. */
export async function ensureDemoSeeded(): Promise<void> {
  if (await readValue<string>(DEMO_NAMESPACE, COLL.seededAt)) return;
  seeding ??= seedDemo().finally(() => (seeding = null));
  return seeding;
}

/** "Reset demo": wipe the demo namespace and reload Nadia's story. */
export async function resetDemo(): Promise<void> {
  await clearNamespace(DEMO_NAMESPACE);
  await seedDemo();
}
