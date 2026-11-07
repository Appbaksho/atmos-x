/**
 * Community = seed (other people, teams, the DU Green Society org, boards) merged live with local data.
 *
 * "Contributors" are the people whose actions are on this device: the local user, and — outside
 * Presentation mode — Nadia, whose story actions are added to her seed team so its numbers match the
 * design. In Presentation mode the local user IS Nadia.
 */
import { DataError } from '../errors';
import {
  COMMUNITY,
  mergeBoard,
  seedMeta,
  seedOrgById,
  seedTeamByCode,
  seedTeamById,
  STORY,
  type LiveRow,
  type SeedTeam,
} from '../seed';
import type { Invite, Leaderboard, LeaderboardScope, LeaderboardSubject, Member, Org, Period, RisingTeam, Team, TeamActivity } from '../types';
import type { ActionLog, TreeCheck } from './v0-types';
import { listActions } from './actions';
import type { DataContext } from './context';
import { buildDemoData } from './demo';
import { assertAccount } from './guest';
import { DAY_MS, newId } from './ids';
import { periodStart, sumVerified } from './points';
import { COLL, readList, updateList, type LocalTeam, type Membership } from './store';
import { assertCanJoin, clampTeamSize, generateTeamCode, MAX_TEAM_MEMBERS, normalizeCode } from './teams-logic';
import { listChecks } from './trees';

export type Contributor = { id: string; name: string; is_me: boolean; actions: ActionLog[]; checks: Pick<TreeCheck, 'points' | 'created_at'>[] };

export async function contributors(ctx: DataContext, now: number = Date.now()): Promise<Contributor[]> {
  const out: Contributor[] = [];
  if (!ctx.presentation) {
    const story = buildDemoData(now);
    out.push({ id: STORY.user.id, name: STORY.user.display_name, is_me: false, actions: story.actions, checks: story.checks });
  }
  if (ctx.kind === 'user') {
    const [actions, checks] = await Promise.all([listActions(ctx.ns), listChecks(ctx.ns)]);
    out.push({ id: ctx.userId, name: ctx.displayName, is_me: true, actions, checks });
  }
  return out;
}

/** Verified action points + tree-check points in a period (what boards and stats count). */
export function contributorPoints(c: Pick<Contributor, 'actions' | 'checks'>, period: Period, now: number = Date.now()) {
  const v = sumVerified(c.actions, { period, now });
  const from = periodStart(period, now);
  const checkPts = c.checks.filter((x) => new Date(x.created_at).getTime() >= from).reduce((s, x) => s + x.points, 0);
  return { ...v, points: v.points + checkPts };
}

export async function myMemberships(ctx: DataContext): Promise<Membership[]> {
  if (ctx.kind === 'guest') return [];
  return readList<Membership>(ctx.ns, COLL.memberships);
}

async function localTeams(ctx: DataContext): Promise<LocalTeam[]> {
  if (ctx.kind === 'guest') return [];
  return readList<LocalTeam>(ctx.ns, COLL.teams);
}

/* ───────────────────────────── Teams ───────────────────────────── */

function teamActivity(seed: SeedTeam | null, contrib: Contributor[], teamId: string, now: number): TeamActivity[] {
  const fromSeed: TeamActivity[] = (seed?.activity ?? []).map((a) => ({
    id: a.id,
    user_name: a.user_name,
    action_type: a.action_type,
    quantity: a.quantity,
    points: a.points,
    created_at: new Date(now - a.days_ago * DAY_MS).toISOString(),
  }));
  const fromLocal: TeamActivity[] = contrib.flatMap((c) =>
    c.actions
      .filter((a) => a.team_id === teamId && a.status !== 'rejected')
      .map((a) => ({ id: a.id, user_name: c.name, action_type: a.action_type, quantity: a.quantity, points: a.points, created_at: a.created_at })),
  );
  return [...fromSeed, ...fromLocal].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
}

function addStats(base: Team['stats'], contrib: Contributor[], teamId: string): Team['stats'] {
  const s = { ...base };
  for (const c of contrib) {
    const v = sumVerified(c.actions, { team_id: teamId });
    s.points += v.points;
    s.trees += v.trees;
    s.actions += v.actions;
    s.cooling_c = +(s.cooling_c + v.cooling_c).toFixed(6);
  }
  return s;
}

export async function getTeam(ctx: DataContext, id: string, now: number = Date.now()): Promise<Team | null> {
  const [contrib, memberships, locals] = await Promise.all([contributors(ctx, now), myMemberships(ctx), localTeams(ctx)]);
  const myRole = memberships.find((m) => m.team_id === id)?.role ?? null;
  const me = contrib.find((c) => c.is_me);
  const myPoints = me ? contributorPoints(me, 'all', now).points : 0;
  const seed = seedTeamById(id) ?? null;

  if (seed) {
    let members: Member[] = seed.members.map((m) =>
      ctx.presentation && m.user_id === ctx.userId ? { ...m, display_name: ctx.displayName, points: myPoints } : m,
    );
    if (myRole && !members.some((m) => m.user_id === ctx.userId)) {
      members = [...members, { user_id: ctx.userId, display_name: ctx.displayName, role: myRole, points: myPoints }];
    }
    const org = seed.org_id ? seedOrgById(seed.org_id) : undefined;
    return {
      id: seed.id,
      name: seed.name,
      code: seed.code,
      description: seed.description,
      org_id: seed.org_id,
      org_name: org?.name ?? null,
      owner_id: seed.owner_id,
      max_members: Math.min(seed.max_members, MAX_TEAM_MEMBERS),
      is_public: seed.is_public,
      area: seed.area,
      city: seed.city,
      country: seed.country,
      members,
      stats: addStats({ ...seed.base }, contrib, seed.id),
      goal_id: ctx.presentation ? seed.goal_id : null,
      activity: teamActivity(seed, contrib, seed.id, now),
      emoji: seed.emoji,
      tasks: seed.tasks,
      evidence: seed.evidence,
    };
  }

  const local = locals.find((t) => t.id === id);
  if (!local) return null;
  const org = local.org_id ? seedOrgById(local.org_id) : undefined;
  return {
    id: local.id,
    name: local.name,
    code: local.code,
    description: local.description,
    org_id: local.org_id,
    org_name: org?.name ?? local.remote?.org_name ?? null,
    owner_id: local.owner_id,
    max_members: local.max_members,
    is_public: local.is_public,
    area: local.area,
    city: local.city,
    country: local.country,
    members: [
      ...remoteMembers(local),
      ...(myRole ? [{ user_id: ctx.userId, display_name: ctx.displayName, role: myRole, points: myPoints }] : []),
    ],
    stats: addStats({ points: 0, trees: 0, actions: 0, cooling_c: 0 }, contrib, local.id),
    goal_id: local.goal_id,
    activity: teamActivity(null, contrib, local.id, now),
    emoji: local.emoji,
    tasks: [],
    evidence: [],
  };
}

export async function myTeams(ctx: DataContext): Promise<Team[]> {
  const ms = await myMemberships(ctx);
  const teams = await Promise.all(ms.map((m) => getTeam(ctx, m.team_id)));
  return teams.filter((t): t is Team => t !== null);
}

export type CreateTeamInput = {
  name: string;
  description?: string | null;
  /** 2–5 (clamped) */
  max_members?: number;
  is_public?: boolean;
  emoji?: string;
  org_id?: string | null;
  goal_id?: string | null;
  area?: string | null;
  city?: string | null;
  country?: string | null;
};

export async function createTeam(ctx: DataContext, input: CreateTeamInput): Promise<Team> {
  assertAccount(ctx.kind, 'teams');
  const name = input.name.trim();
  if (name.length < 3 || name.length > 60) throw new DataError('team.invalid_name', 'Team names are 3–60 characters', 400);
  const taken = new Set([...COMMUNITY.teams.map((t) => t.code), ...(await localTeams(ctx)).map((t) => t.code)]);
  const team: LocalTeam = {
    id: newId('t'),
    name,
    code: generateTeamCode(Math.random, taken),
    description: input.description?.trim() || null,
    org_id: input.org_id ?? null,
    owner_id: ctx.userId,
    max_members: clampTeamSize(input.max_members ?? MAX_TEAM_MEMBERS),
    is_public: input.is_public ?? true,
    area: input.area ?? null,
    city: input.city ?? null,
    country: input.country ?? null,
    emoji: input.emoji ?? '🌳',
    goal_id: input.goal_id ?? null,
    created_at: new Date().toISOString(),
  };
  await updateList<LocalTeam>(ctx.ns, COLL.teams, (l) => [team, ...l]);
  await updateList<Membership>(ctx.ns, COLL.memberships, (l) => [...l, { team_id: team.id, role: 'owner', joined_at: team.created_at }]);
  return (await getTeam(ctx, team.id)) as Team;
}

/** Preview of a team created on another device, carried in its invite link (`?t=`). */
export type RemoteInvite = { id: string; name: string; max_members: number; members: number; org_name?: string | null; emoji?: string; inviter?: string | null };

/** Placeholder members standing in for the people who joined on other devices. */
function remoteMembers(local: LocalTeam): Member[] {
  if (!local.remote) return [];
  return Array.from({ length: local.remote.members }, (_, i) => ({
    user_id: `${local.id}:remote:${i}`,
    display_name: i === 0 && local.remote?.inviter ? local.remote.inviter : `Member ${i + 1}`,
    role: i === 0 ? ('owner' as const) : ('member' as const),
    points: 0,
  }));
}

/**
 * Teams live per device in v0, so a team created elsewhere is unknown here. When the invite link
 * carries a preview, remember the team locally (no membership) so it can be shown and joined.
 */
async function rememberRemoteTeam(ctx: DataContext, code: string, inv: RemoteInvite): Promise<string> {
  const existing = (await localTeams(ctx)).find((t) => t.code === code);
  if (existing) return existing.id;
  const team: LocalTeam = {
    id: inv.id || newId('t'),
    name: inv.name.slice(0, 60),
    code,
    description: null,
    org_id: null,
    owner_id: 'remote',
    max_members: clampTeamSize(inv.max_members),
    is_public: true,
    area: null,
    city: null,
    country: null,
    emoji: inv.emoji ?? '🌳',
    goal_id: null,
    created_at: new Date().toISOString(),
    remote: { members: Math.max(1, Math.min(inv.members, MAX_TEAM_MEMBERS)), org_name: inv.org_name ?? null, inviter: inv.inviter ?? null },
  };
  await updateList<LocalTeam>(ctx.ns, COLL.teams, (l) => [team, ...l]);
  return team.id;
}

/** Join by invite code: seed teams, teams on this device, or (with an invite preview) a team from another device. Enforces the 5-member limit. */
export async function joinByCode(ctx: DataContext, rawCode: string, invite?: RemoteInvite | null): Promise<Team> {
  assertAccount(ctx.kind, 'teams');
  const code = normalizeCode(rawCode);
  let id = seedTeamByCode(code)?.id ?? (await localTeams(ctx)).find((t) => t.code === code)?.id;
  if (!id && invite) id = await rememberRemoteTeam(ctx, code, invite);
  if (!id) throw new DataError('team.invalid_code', 'No team has this invite code', 404);
  const team = await getTeam(ctx, id);
  if (!team) throw new DataError('team.invalid_code', 'No team has this invite code', 404);
  assertCanJoin(team, ctx.userId);
  await updateList<Membership>(ctx.ns, COLL.memberships, (l) => [...l, { team_id: id, role: 'member', joined_at: new Date().toISOString() }]);
  return (await getTeam(ctx, id)) as Team;
}

/** Look up a team by code without joining (invite landing page). Works for guests. */
export async function teamByCode(ctx: DataContext, rawCode: string, invite?: RemoteInvite | null): Promise<Team | null> {
  const code = normalizeCode(rawCode);
  let id = seedTeamByCode(code)?.id ?? (await localTeams(ctx)).find((t) => t.code === code)?.id;
  if (!id && invite) id = await rememberRemoteTeam(ctx, code, invite);
  return id ? getTeam(ctx, id) : null;
}

export async function leaveTeam(ctx: DataContext, id: string): Promise<void> {
  assertAccount(ctx.kind, 'teams');
  await updateList<Membership>(ctx.ns, COLL.memberships, (l) => l.filter((m) => m.team_id !== id));
  // a team you created on this device has no one else in it: remove it
  await updateList<LocalTeam>(ctx.ns, COLL.teams, (l) => l.filter((t) => !(t.id === id && t.owner_id === ctx.userId)));
}

export function inviteFor(team: Pick<Team, 'code'>, origin?: string): Invite {
  const base =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  return { code: team.code, url: `${base.replace(/\/$/, '')}/join/${encodeURIComponent(team.code)}` };
}

/* ───────────────────────────── Orgs ───────────────────────────── */

export async function getOrg(ctx: DataContext, id: string): Promise<Org | null> {
  const seed = seedOrgById(id);
  if (!seed) return null;
  const teams = (await Promise.all(seed.team_ids.map((t) => getTeam(ctx, t)))).filter((t): t is Team => t !== null);
  return {
    id: seed.id,
    name: seed.name,
    kind: seed.kind,
    city: seed.city,
    country: seed.country,
    verified: seed.verified,
    description: seed.description,
    logo_url: null,
    logo_emoji: seed.logo_emoji,
    teams: teams.map((t) => ({ id: t.id, name: t.name, stats: t.stats, emoji: t.emoji })).sort((a, b) => b.stats.points - a.stats.points),
    totals: {
      points: teams.reduce((s, t) => s + t.stats.points, 0),
      trees: teams.reduce((s, t) => s + t.stats.trees, 0),
      members: teams.reduce((s, t) => s + t.members.length, 0),
      cooling_c: +teams.reduce((s, t) => s + t.stats.cooling_c, 0).toFixed(6),
    },
    goals: seed.goals,
  };
}

/* ───────────────────────────── Leaderboards ───────────────────────────── */

export type LeaderboardQuery = { subject: LeaderboardSubject; scope: LeaderboardScope; period: Period };

export async function leaderboard(ctx: DataContext, q: LeaderboardQuery, now: number = Date.now()): Promise<Leaderboard> {
  const board = COMMUNITY.boards[q.subject][q.scope][q.period];
  const contrib = await contributors(ctx, now);
  const memberships = await myMemberships(ctx);
  const myTeamIds = new Set(memberships.map((m) => m.team_id));
  const locals = await localTeams(ctx);
  let live: LiveRow[] = [];

  if (q.subject === 'user') {
    live = contrib.map((c) => {
      const p = contributorPoints(c, q.period, now);
      return { id: c.id, name: c.name, points: p.points, trees: p.trees, cooling_c: p.cooling_c, is_me: c.is_me };
    });
  } else {
    // points each contributor added to a team in this period
    const added = new Map<string, { points: number; trees: number; cooling_c: number }>();
    for (const c of contrib) {
      for (const a of c.actions) {
        if (!a.team_id || a.status !== 'verified' || new Date(a.created_at).getTime() < periodStart(q.period, now)) continue;
        const cur = added.get(a.team_id) ?? { points: 0, trees: 0, cooling_c: 0 };
        added.set(a.team_id, { points: cur.points + a.points, trees: cur.trees + a.trees, cooling_c: cur.cooling_c + a.cooling_c });
      }
    }
    const teamIds = new Set([...added.keys(), ...myTeamIds]);
    const boardRow = (id: string) => board.rows.find((r) => r.id === id);

    if (q.subject === 'team') {
      live = [...teamIds].flatMap((id): LiveRow[] => {
        const seed = seedTeamById(id);
        const local = locals.find((t) => t.id === id);
        if (!seed && !local) return [];
        const add = added.get(id) ?? { points: 0, trees: 0, cooling_c: 0 };
        const row = boardRow(id);
        return [{
          id,
          name: seed?.name ?? local?.name ?? id,
          emoji: seed?.emoji ?? local?.emoji,
          points: (seed?.period_points[q.period] ?? 0) + add.points,
          trees: (row?.trees ?? 0) + add.trees,
          cooling_c: +((row?.cooling_c ?? 0) + add.cooling_c).toFixed(6),
          is_me: myTeamIds.has(id),
        }];
      });
    } else {
      const orgOf = (teamId: string) => seedTeamById(teamId)?.org_id ?? locals.find((t) => t.id === teamId)?.org_id ?? null;
      const orgAdded = new Map<string, { points: number; trees: number; cooling_c: number; mine: boolean }>();
      for (const id of teamIds) {
        const org = orgOf(id);
        if (!org) continue;
        const add = added.get(id) ?? { points: 0, trees: 0, cooling_c: 0 };
        const cur = orgAdded.get(org) ?? { points: 0, trees: 0, cooling_c: 0, mine: false };
        orgAdded.set(org, {
          points: cur.points + add.points,
          trees: cur.trees + add.trees,
          cooling_c: cur.cooling_c + add.cooling_c,
          mine: cur.mine || myTeamIds.has(id),
        });
      }
      live = [...orgAdded.entries()].flatMap(([id, add]): LiveRow[] => {
        const seed = seedOrgById(id);
        if (!seed) return [];
        const row = boardRow(id);
        return [{
          id,
          name: seed.name,
          emoji: seed.logo_emoji,
          points: seed.period_points[q.period] + add.points,
          trees: (row?.trees ?? 0) + add.trees,
          cooling_c: +((row?.cooling_c ?? 0) + add.cooling_c).toFixed(6),
          is_me: add.mine,
        }];
      });
    }
  }

  const { rows, me } = mergeBoard(board, live);
  return { rows, me, meta: seedMeta() };
}

export function risingTeams(): RisingTeam[] {
  return COMMUNITY.rising;
}
