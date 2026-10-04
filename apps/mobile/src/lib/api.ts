import { supabase } from './supabase';

export type Profile = {
  id: string;
  display_name: string;
  avatar_emoji: string;
  home_lat: number | null;
  home_lng: number | null;
  goal_trees: number;
  goal_points: number;
  farmer_mode: boolean;
  crop: string | null;
  crop_stage: string | null;
};

export type Clan = {
  id: string;
  name: string;
  description: string;
  kind: 'community' | 'organization' | 'school' | 'farm';
  emoji: string;
  owner_id: string;
  goal_trees: number;
  goal_cooling_c: number;
  zone_label: string | null;
  center_lat: number | null;
  center_lng: number | null;
  is_public: boolean;
  invite_code: string;
  created_at: string;
};

export type ActionLog = {
  id: string;
  user_id: string;
  clan_id: string | null;
  action_type: string;
  quantity: number;
  points: number;
  cooling_c: number;
  trees: number;
  zone_label: string | null;
  note: string | null;
  created_at: string;
};

export type MyStats = {
  points: number;
  trees: number;
  actions: number;
  cooling_c: number;
  clans: number;
  global_rank: number;
};

export type UserRow = {
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  points: number;
  trees: number;
  actions: number;
  rank: number;
};

export type ClanRow = {
  clan_id: string;
  name: string;
  emoji: string;
  kind: string;
  members: number;
  points: number;
  trees: number;
  cooling_c: number;
  goal_trees: number;
  rank: number;
};

export type Period = 'week' | 'month' | 'all';

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/* ---------------------------------------------------------------- profile */

export async function getProfile(userId: string): Promise<Profile | null> {
  return check(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
}

export async function updateProfile(userId: string, patch: Partial<Profile>) {
  return check(await supabase.from('profiles').update(patch).eq('id', userId).select().single());
}

export async function getMyStats(): Promise<MyStats> {
  const rows = check(await supabase.rpc('get_my_stats')) as MyStats[];
  const r = rows?.[0];
  return {
    points: Number(r?.points ?? 0),
    trees: Number(r?.trees ?? 0),
    actions: Number(r?.actions ?? 0),
    cooling_c: Number(r?.cooling_c ?? 0),
    clans: Number(r?.clans ?? 0),
    global_rank: Number(r?.global_rank ?? 0),
  };
}

/* ---------------------------------------------------------------- actions */

export async function logAction(input: {
  action_type: string;
  quantity: number;
  clan_id?: string | null;
  lat?: number;
  lng?: number;
  zone_label?: string | null;
  note?: string | null;
}): Promise<ActionLog> {
  return check(await supabase.from('action_logs').insert(input).select().single());
}

export async function myRecentLogs(userId: string, limit = 20): Promise<ActionLog[]> {
  return check(
    await supabase
      .from('action_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
}

export async function deleteLog(id: string) {
  check(await supabase.from('action_logs').delete().eq('id', id));
}

/* ------------------------------------------------------------------ clans */

export async function myClans(userId: string): Promise<Clan[]> {
  const rows = check(
    await supabase.from('clan_members').select('clans(*)').eq('user_id', userId),
  ) as unknown as { clans: Clan | null }[];
  return rows.map((r) => r.clans).filter((c): c is Clan => !!c);
}

export async function publicClans(search = ''): Promise<Clan[]> {
  let q = supabase.from('clans').select('*').eq('is_public', true).order('created_at', { ascending: false }).limit(50);
  if (search.trim()) q = q.ilike('name', `%${search.trim()}%`);
  return check(await q);
}

export async function getClan(id: string): Promise<Clan | null> {
  return check(await supabase.from('clans').select('*').eq('id', id).maybeSingle());
}

export async function createClan(input: Partial<Clan> & { name: string; owner_id: string }): Promise<Clan> {
  return check(await supabase.from('clans').insert(input).select().single());
}

export async function updateClan(id: string, patch: Partial<Clan>) {
  return check(await supabase.from('clans').update(patch).eq('id', id).select().single());
}

export async function joinClan(clanId: string, userId: string) {
  check(await supabase.from('clan_members').insert({ clan_id: clanId, user_id: userId }));
}

export async function joinClanByCode(code: string): Promise<string> {
  return check(await supabase.rpc('join_clan_by_code', { p_code: code })) as string;
}

export async function leaveClan(clanId: string, userId: string) {
  check(await supabase.from('clan_members').delete().eq('clan_id', clanId).eq('user_id', userId));
}

export async function isMember(clanId: string, userId: string): Promise<{ member: boolean; role?: string }> {
  const row = check(
    await supabase.from('clan_members').select('role').eq('clan_id', clanId).eq('user_id', userId).maybeSingle(),
  ) as { role: string } | null;
  return { member: !!row, role: row?.role };
}

export async function clanStats(clanId: string) {
  const rows = check(await supabase.rpc('get_clan_stats', { p_clan: clanId })) as any[];
  const r = rows?.[0] ?? {};
  return {
    points: Number(r.points ?? 0),
    trees: Number(r.trees ?? 0),
    actions: Number(r.actions ?? 0),
    cooling_c: Number(r.cooling_c ?? 0),
    members: Number(r.members ?? 0),
  };
}

export async function clanActivity(clanId: string, limit = 25) {
  return check(
    await supabase
      .from('action_logs')
      .select('*, profiles(display_name, avatar_emoji)')
      .eq('clan_id', clanId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ) as (ActionLog & { profiles: { display_name: string; avatar_emoji: string } | null })[];
}

/* ------------------------------------------------------------ leaderboards */

export async function userLeaderboard(period: Period, clanId?: string): Promise<UserRow[]> {
  const rows = check(
    await supabase.rpc('get_user_leaderboard', { p_period: period, p_clan: clanId ?? null }),
  ) as UserRow[];
  return rows.map((r) => ({ ...r, points: Number(r.points), trees: Number(r.trees), actions: Number(r.actions), rank: Number(r.rank) }));
}

export async function clanLeaderboard(period: Period): Promise<ClanRow[]> {
  const rows = check(await supabase.rpc('get_clan_leaderboard', { p_period: period })) as ClanRow[];
  return rows.map((r) => ({
    ...r,
    members: Number(r.members),
    points: Number(r.points),
    trees: Number(r.trees),
    cooling_c: Number(r.cooling_c),
    rank: Number(r.rank),
  }));
}

export type Member = {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: { display_name: string; avatar_emoji: string } | null;
};

export async function clanMembers(clanId: string): Promise<Member[]> {
  return check(
    await supabase
      .from('clan_members')
      .select('user_id, role, joined_at, profiles(display_name, avatar_emoji)')
      .eq('clan_id', clanId)
      .order('joined_at'),
  ) as unknown as Member[];
}
