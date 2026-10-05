/** Profile (contract `Profile`) = device prefs (prefs-store) + per-namespace profile fields. */
import { setPrefs, type Prefs } from '@/lib/prefs-store';

import type { MyStats, Profile } from '../types';
import { listActions } from './actions';
import { leaderboard, myMemberships } from './community';
import type { DataContext } from './context';
import { updateAccount } from './accounts';
import { computeStats } from './points';
import { COLL, readValue, updateValue, type LocalProfile } from './store';
import { listChecks } from './trees';

export async function getProfile(ctx: DataContext): Promise<Profile> {
  const local = await readValue<LocalProfile>(ctx.ns, COLL.profile);
  const p = ctx.prefs;
  return {
    display_name: local?.display_name ?? ctx.displayName,
    avatar_url: local?.avatar_url ?? null,
    home: local?.home ?? null,
    radius_m: p.radius_m,
    lang: p.lang,
    unit: p.unit,
    area: p.area,
    theme: p.theme,
    farmer_mode: p.farmer_mode,
    ask_on: p.ask_on,
    onboarded: p.onboarded,
    presentation: p.presentation,
  };
}

const PREF_KEYS = ['radius_m', 'lang', 'unit', 'area', 'theme', 'farmer_mode', 'ask_on', 'onboarded', 'presentation'] as const;

/** Device prefs go to prefs-store (any role); name/home/avatar to the namespace (guests: home only). */
export async function updateProfile(ctx: DataContext, patch: Partial<Profile>): Promise<void> {
  const prefPatch: Partial<Prefs> = {};
  for (const k of PREF_KEYS) {
    if (patch[k] !== undefined) (prefPatch as Record<string, unknown>)[k] = patch[k];
  }
  const local: Partial<LocalProfile> = {};
  if (patch.display_name !== undefined && ctx.kind === 'user') local.display_name = patch.display_name;
  if (patch.avatar_url !== undefined && ctx.kind === 'user') local.avatar_url = patch.avatar_url ?? null;
  if (patch.home !== undefined) local.home = patch.home;
  if (Object.keys(local).length) {
    await updateValue<LocalProfile>(ctx.ns, COLL.profile, (cur) => ({ display_name: null, home: null, avatar_url: null, ...cur, ...local }));
  }
  if (local.display_name && ctx.ns.startsWith('user:')) await updateAccount(ctx.userId, { display_name: local.display_name });
  if (Object.keys(prefPatch).length) await setPrefs(prefPatch);
}

export async function myStats(ctx: DataContext, now: number = Date.now()): Promise<MyStats> {
  if (ctx.kind === 'guest') return computeStats({ actions: [], checks: [], clans: 0, rank_area: null });
  const [actions, checks, memberships, board] = await Promise.all([
    listActions(ctx.ns),
    listChecks(ctx.ns),
    myMemberships(ctx),
    leaderboard(ctx, { subject: 'user', scope: 'area', period: 'all' }, now),
  ]);
  return computeStats({ actions, checks, clans: memberships.length, rank_area: board.me?.rank ?? null });
}

