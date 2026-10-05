import { beforeEach, describe, expect, it } from 'vitest';

import { logAction } from '../local/actions';
import { getOrg, getTeam, joinByCode, leaderboard } from '../local/community';
import { seedDemo } from '../local/demo';
import { myStats } from '../local/profile';
import { demoCtx, freshStore, guestCtx, userCtx } from '../local/test-helpers';
import { COMMUNITY, STORY } from './index';
import { estimateRank, mergeBoard } from './leaderboard';

const deps = {
  prepare: async (b: Blob) => ({ stored: b, preview: 'data:image/jpeg;base64,AAAA' }),
  verify: async () => ({ status: 'verified' as const, confidence: 0.9, seen: 'A sapling', reason_code: 'ok' }),
};
const plant = (qty: number) => ({
  action_type: 'plant_tree' as const,
  quantity: qty,
  lat: 23.76,
  lng: 90.36,
  taken_at: new Date().toISOString(),
  photo: new Blob(['x'], { type: 'image/jpeg' }),
  species_id: 'neem',
});

describe('mergeBoard (pure)', () => {
  const board = {
    rows: [
      { id: 'a', name: 'A', points: 300, trees: 0, cooling_c: 0 },
      { id: 'b', name: 'B', points: 200, trees: 0, cooling_c: 0 },
      { id: 'c', name: 'C', points: 100, trees: 0, cooling_c: 0 },
    ],
    tail: [[100, 4], [50, 40], [0, 100]] as [number, number][],
  };

  it('inserts, replaces and re-ranks live rows', () => {
    const r = mergeBoard(board, [{ id: 'me', name: 'Me', points: 250, trees: 0, cooling_c: 0, is_me: true }]);
    expect(r.rows.map((x) => [x.id, x.rank])).toEqual([['a', 1], ['me', 2], ['b', 3], ['c', 4]]);
    expect(r.me?.rank).toBe(2);
    const replaced = mergeBoard(board, [{ id: 'c', name: 'C', points: 400, trees: 0, cooling_c: 0, is_me: true }]);
    expect(replaced.rows[0]).toMatchObject({ id: 'c', rank: 1, points: 400 });
  });

  it('estimates ranks below the explicit rows from the tail', () => {
    expect(estimateRank(board.tail, 75)).toBe(22);
    const r = mergeBoard(board, [{ id: 'me', name: 'Me', points: 50, trees: 0, cooling_c: 0, is_me: true }], { top: 3 });
    expect(r.rows).toHaveLength(3);
    expect(r.me?.rank).toBe(40);
  });

  it('ties share a rank', () => {
    const r = mergeBoard(board, [{ id: 'me', name: 'Me', points: 200, trees: 0, cooling_c: 0, is_me: true }]);
    expect(r.rows.filter((x) => x.rank === 2).map((x) => x.id).sort()).toEqual(['b', 'me']);
  });
});

describe('seed boards merged with the story', () => {
  beforeEach(freshStore);

  it("normal mode: Nadia's row is built from her story (2,340 pts, area #9)", async () => {
    const lb = await leaderboard(guestCtx(), { subject: 'user', scope: 'area', period: 'all' });
    expect(lb.rows.find((r) => r.id === STORY.user.id)).toMatchObject({ points: 2340, rank: 9 });
    expect(lb.me).toBeNull();
    expect(lb.meta.sources[0].name).toBe('Demo community');
    const city = await leaderboard(guestCtx(), { subject: 'user', scope: 'city', period: 'all' });
    expect(city.rows.every((r) => r.id !== STORY.user.id)).toBe(true);
  });

  it('team and org boards match the design (HRC 9,820 #9; DU Green Society 18,420 #7)', async () => {
    const teams = await leaderboard(guestCtx(), { subject: 'team', scope: 'area', period: 'all' });
    expect(teams.rows.find((r) => r.id === 'hall-rooftop-crew')).toMatchObject({ points: 9820, rank: 9 });
    const orgs = await leaderboard(guestCtx(), { subject: 'org', scope: 'area', period: 'all' });
    expect(orgs.rows.find((r) => r.id === 'du-green-society')).toMatchObject({ points: 18420, rank: 7 });
    const team = await getTeam(guestCtx(), 'hall-rooftop-crew');
    expect(team?.stats.points).toBe(9820);
    const org = await getOrg(guestCtx(), 'du-green-society');
    expect(org?.totals.points).toBe(18420);
    expect(org?.teams).toHaveLength(4);
  });

  it('Presentation mode: same numbers from the demo namespace, and logging an action moves Nadia up', async () => {
    await seedDemo();
    const ctx = demoCtx();
    const before = await leaderboard(ctx, { subject: 'user', scope: 'area', period: 'all' });
    expect(before.me).toMatchObject({ id: 'u-nadia', points: 2340, rank: 9, is_me: true });
    const stats = await myStats(ctx);
    expect(stats.points).toBe(2340);
    expect(stats.provisional_points).toBe(25);
    expect(stats.rank_area).toBe(9);
    expect(stats.level.name_code).toBe('level.canopy_keeper');

    const teamsBefore = await leaderboard(ctx, { subject: 'team', scope: 'area', period: 'all' });
    expect(teamsBefore.me).toMatchObject({ id: 'hall-rooftop-crew', points: 9820, rank: 9 });

    await logAction(ctx, { ...plant(2), team_id: 'hall-rooftop-crew' }, deps);
    const after = await leaderboard(ctx, { subject: 'user', scope: 'area', period: 'all' });
    expect(after.me).toMatchObject({ points: 2440, rank: 8 });
    const teamsAfter = await leaderboard(ctx, { subject: 'team', scope: 'area', period: 'all' });
    expect(teamsAfter.me?.points).toBe(9920);
    const week = await leaderboard(ctx, { subject: 'user', scope: 'area', period: 'week' });
    expect(week.me?.points).toBe(260 + 100);
  });

  it('a new local user appears on the board and climbs as they log', async () => {
    const me = userCtx();
    await joinByCode(me, '4K7Q-29');
    const empty = await leaderboard(me, { subject: 'user', scope: 'area', period: 'all' });
    expect(empty.me).toMatchObject({ points: 0, is_me: true });
    await logAction(me, plant(5), deps);
    const lb = await leaderboard(me, { subject: 'user', scope: 'area', period: 'all' });
    expect(lb.me?.points).toBe(250);
    expect(lb.me!.rank).toBeLessThan(empty.me!.rank);
    // the team board flags my team; team actions add to it
    await logAction(me, { ...plant(1), team_id: 'hall-rooftop-crew' }, deps);
    const teams = await leaderboard(me, { subject: 'team', scope: 'area', period: 'all' });
    expect(teams.me).toMatchObject({ id: 'hall-rooftop-crew', points: 9870 });
  });

  it('every board has rows and descending tails', () => {
    for (const subject of ['user', 'team', 'org'] as const)
      for (const scope of ['area', 'city', 'country'] as const)
        for (const period of ['week', 'month', 'all'] as const) {
          const b = COMMUNITY.boards[subject][scope][period];
          expect(b.rows.length).toBeGreaterThan(0);
          for (let i = 1; i < b.tail.length; i++) expect(b.tail[i][0]).toBeLessThan(b.tail[i - 1][0]);
        }
  });
});
