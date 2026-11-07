import { describe, expect, it } from 'vitest';

import type { ActionLog } from './v0-types';
import { ACTION_TYPES, badgesFor, computeStats, levelFor, scoreAction, sumVerified } from './points';

const DAY = 864e5;
const log = (over: Partial<ActionLog>): ActionLog => ({
  id: Math.random().toString(36),
  action_type: 'plant_tree',
  quantity: 1,
  points: 50,
  cooling_c: 0.0006,
  trees: 1,
  status: 'verified',
  photo_url: null,
  lat: null,
  lng: null,
  taken_at: null,
  goal_id: null,
  team_id: null,
  zone_label: null,
  note: null,
  created_at: new Date().toISOString(),
  ...over,
});

describe('action types', () => {
  it('matches the supabase action_types seed', () => {
    const table = Object.fromEntries(ACTION_TYPES.map((a) => [a.id, [a.points, a.cooling_per_unit, a.is_tree]]));
    expect(table).toEqual({
      plant_tree: [50, 0.0006, true],
      plant_shrubs: [12, 0.0001, false],
      rooftop_garden: [40, 0.0003, false],
      cool_roof: [30, 0.0004, false],
      green_wall: [20, 0.00015, false],
      shade_structure: [25, 0.0002, false],
      water_tree: [5, 0, false],
      awareness: [30, 0, false],
    });
  });

  it('scores like the score_action_log trigger', () => {
    expect(scoreAction('plant_tree', 3)).toEqual({ points: 150, cooling_c: 0.0018, trees: 3 });
    expect(scoreAction('cool_roof', 12)).toEqual({ points: 360, cooling_c: 0.0048, trees: 0 });
    expect(scoreAction('awareness', 0).points).toBe(30); // quantity clamps to ≥ 1
  });
});

describe('levelFor', () => {
  it('walks the thresholds', () => {
    expect(levelFor(0)).toEqual({ level: 1, name_code: 'level.seedling', min: 0, next: 200 });
    expect(levelFor(199).level).toBe(1);
    expect(levelFor(200)).toMatchObject({ level: 2, name_code: 'level.sapling', next: 600 });
    expect(levelFor(2340)).toMatchObject({ level: 4, name_code: 'level.canopy_keeper', min: 1500, next: 4000 });
    expect(levelFor(10000)).toMatchObject({ level: 6, name_code: 'level.climate_guardian', next: null });
  });
});

describe('badgesFor', () => {
  it('earns badges by thresholds', () => {
    const earned = (s: Parameters<typeof badgesFor>[0]) => badgesFor(s).filter((b) => b.earned).map((b) => b.id);
    expect(earned({ trees: 0, actions: 0, points: 0, clans: 0 })).toEqual([]);
    expect(earned({ trees: 4, actions: 16, points: 2340, clans: 1 })).toEqual(['first', 'clan', 'p1000']);
    expect(earned({ trees: 100, actions: 25, points: 1000, clans: 0 })).toEqual(['first', 'trees10', 'trees100', 'p1000', 'streak']);
    expect(badgesFor({ trees: 0, actions: 0, points: 0, clans: 0 }).every((b) => b.code === `badge.${b.id}`)).toBe(true);
  });
});

describe('stats', () => {
  it('counts pending as provisional, not points; rejected not at all', () => {
    const actions = [
      log({ points: 150, trees: 3, cooling_c: 0.0018 }),
      log({ status: 'pending', action_type: 'shade_structure', points: 25, trees: 0, cooling_c: 0.0002 }),
      log({ status: 'rejected', points: 50 }),
    ];
    const s = computeStats({ actions, checks: [{ points: 5 }], clans: 1, rank_area: 9 });
    expect(s.points).toBe(155);
    expect(s.provisional_points).toBe(25);
    expect(s.trees).toBe(3);
    expect(s.actions).toBe(2);
    expect(s.level.level).toBe(1);
    expect(s.rank_area).toBe(9);
    expect(s.badges.find((b) => b.id === 'clan')?.earned).toBe(true);
  });

  it('filters verified points by period and team', () => {
    const now = Date.now();
    const actions = [
      log({ points: 100, created_at: new Date(now - 2 * DAY).toISOString(), team_id: 't1' }),
      log({ points: 40, created_at: new Date(now - 10 * DAY).toISOString() }),
      log({ points: 7, created_at: new Date(now - 40 * DAY).toISOString(), team_id: 't1' }),
      log({ points: 1000, status: 'pending' }),
    ];
    expect(sumVerified(actions, { period: 'week', now }).points).toBe(100);
    expect(sumVerified(actions, { period: 'month', now }).points).toBe(140);
    expect(sumVerified(actions, { period: 'all', now }).points).toBe(147);
    expect(sumVerified(actions, { team_id: 't1', now }).points).toBe(107);
  });
});
