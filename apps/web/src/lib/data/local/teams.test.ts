import { beforeEach, describe, expect, it } from 'vitest';

import { COMMUNITY } from '../seed';
import { createTeam, getTeam, inviteFor, joinByCode, leaveTeam, myTeams } from './community';
import { freshStore, guestCtx, userCtx } from './test-helpers';
import { assertCanJoin, CODE_ALPHABET, generateTeamCode, isValidCode, MAX_TEAM_MEMBERS, normalizeCode } from './teams-logic';

describe('team codes', () => {
  it('never uses ambiguous characters', () => {
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 500; i++) {
      const c = generateTeamCode(rnd);
      expect(isValidCode(c)).toBe(true);
      expect(c).not.toMatch(/[01OIL]/);
    }
  });

  it('avoids taken codes', () => {
    const seq = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const code = generateTeamCode(() => seq[i++ % seq.length], new Set(['2222-22']));
    expect(code).not.toBe('2222-22');
  });

  it('normalizes typed codes', () => {
    expect(normalizeCode(' 4k7q29 ')).toBe('4K7Q-29');
    expect(normalizeCode('4k7q-29')).toBe('4K7Q-29');
  });

  it('seed codes are valid', () => {
    for (const t of COMMUNITY.teams) expect(isValidCode(t.code)).toBe(true);
  });
});

describe('team member limit', () => {
  it('max 5 members', () => {
    expect(MAX_TEAM_MEMBERS).toBe(5);
    const members = (n: number) => Array.from({ length: n }, (_, i) => ({ user_id: `u${i}` }));
    expect(() => assertCanJoin({ members: members(4), max_members: 5 }, 'me')).not.toThrow();
    expect(() => assertCanJoin({ members: members(5), max_members: 5 }, 'me')).toThrow(expect.objectContaining({ code: 'team.full' }));
    expect(() => assertCanJoin({ members: members(5), max_members: 8 }, 'me')).toThrow(expect.objectContaining({ code: 'team.full' }));
    expect(() => assertCanJoin({ members: [{ user_id: 'me' }], max_members: 5 }, 'me')).toThrow(expect.objectContaining({ code: 'team.already_member' }));
  });

  describe('join by code', () => {
    beforeEach(freshStore);

    it('joins Hall Rooftop Crew (4 → 5 members), then it is full for the next person', async () => {
      const me = userCtx();
      const team = await joinByCode(me, '4k7q 29');
      expect(team.id).toBe('hall-rooftop-crew');
      expect(team.members).toHaveLength(5);
      expect(team.members.some((m) => m.user_id === me.userId)).toBe(true);
      expect((await myTeams(me)).map((t) => t.id)).toEqual(['hall-rooftop-crew']);
      await expect(joinByCode(me, '4K7Q-29')).rejects.toMatchObject({ code: 'team.already_member' });

      // another local profile (own namespace) sees the seed team + no membership
      const other = userCtx({ ns: 'user:p-other', userId: 'p-other' });
      await expect(joinByCode(other, '4K7Q-29')).resolves.toMatchObject({ id: 'hall-rooftop-crew' });
    });

    it('rejects a full team and unknown codes', async () => {
      await expect(joinByCode(userCtx(), 'GM7X-42')).rejects.toMatchObject({ code: 'team.full' });
      await expect(joinByCode(userCtx(), 'ZZZZ-99')).rejects.toMatchObject({ code: 'team.invalid_code' });
    });

    it('guests cannot create or join', async () => {
      await expect(joinByCode(guestCtx(), '4K7Q-29')).rejects.toMatchObject({ code: 'auth.guest_restricted' });
      await expect(createTeam(guestCtx(), { name: 'My crew' })).rejects.toMatchObject({ code: 'auth.guest_restricted' });
    });

    it('creates a team with a unique code, clamped size, owner membership, invite link', async () => {
      const me = userCtx();
      const t = await createTeam(me, { name: 'Asad Gate Shade Crew', max_members: 9 });
      expect(t.max_members).toBe(5);
      expect(isValidCode(t.code)).toBe(true);
      expect(t.members).toEqual([expect.objectContaining({ user_id: me.userId, role: 'owner' })]);
      expect(inviteFor(t, 'https://atmos.test/').url).toBe(`https://atmos.test/join/${t.code}`);
      await leaveTeam(me, t.id);
      expect(await getTeam(me, t.id)).toBeNull();
    });
  });
});
