'use client';
/**
 * Community on the server (prompt-v1 §6.8): teams, invites, chat, orgs, leaderboards, feed, posts,
 * comments, likes, follows, blocks, reports, public profiles, events and moderation.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { postForm } from '@/lib/api/client';

import type {
  ChatMessage,
  CommunityEvent,
  FeedFilter,
  FeedPage,
  Invite,
  LatLng,
  Leaderboard,
  LeaderboardScope,
  LeaderboardSubject,
  ModerationQueue,
  Org,
  OrgKind,
  Period,
  Post,
  PostComment,
  PublicProfile,
  ReportReason,
  ReportTarget,
  Team,
} from '../types';
import { photoForUpload } from './actions';
import { useDataContext } from './context';
import { getJSON, request, shouldRetry } from './http';
import { API } from './heat';
import { invalidate, qk } from './keys';

export const MAX_TEAM_MEMBERS = 5;
export const MIN_TEAM_MEMBERS = 2;

/** Invite codes are 6 letters/digits (no 0, O, 1, I). Spaces and dashes are ignored. */
export function normalizeCode(code: string): string {
  return code.replace(/[\s-]+/g, '').toUpperCase();
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await request(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const enc = encodeURIComponent;

/* ─────────────────────────── teams ─────────────────────────── */

/** Teams I'm in (guests: []). */
export function useTeams() {
  const ctx = useDataContext();
  return useQuery<Team[]>({
    queryKey: qk.teams(ctx.ns),
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: ({ signal }) => (ctx.kind === 'guest' ? Promise.resolve([]) : getJSON<Team[]>(`${API}/teams`, { mine: true }, signal)),
  });
}

/** Public teams to discover, optionally by name. */
export function useDiscoverTeams(q = '') {
  const ctx = useDataContext();
  return useQuery<Team[]>({
    queryKey: [...qk.teams(ctx.ns), 'discover', q.trim().toLowerCase()],
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<Team[]>(`${API}/teams`, { q: q.trim() || undefined }, signal),
  });
}

export function useTeam(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<Team | null>({
    queryKey: qk.team(ctx.ns, id ?? ''),
    enabled: ctx.ready && !!id,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<Team>(`${API}/teams/${enc(id!)}`, {}, signal),
  });
}

/** Invite landing (/join/[code]): the team without joining. Works for guests. */
export function useTeamByCode(code: string | null | undefined) {
  const ctx = useDataContext();
  const c = code ? normalizeCode(code) : '';
  return useQuery<Team | null>({
    queryKey: qk.teamByCode(ctx.ns, c),
    enabled: ctx.ready && c.length >= 4,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<Team>(`${API}/teams/by-code/${enc(c)}`, {}, signal),
  });
}

export type CreateTeamInput = { name: string; description?: string | null; is_public?: boolean; emoji?: string | null; org_id?: string | null; max_members?: number };

/** Create a team (2–5 members). Guests: GuestRestrictedError. */
export function useCreateTeam() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Team, Error, CreateTeamInput>({
    mutationFn: (input) => send<Team>('POST', '/teams', input),
    onSuccess: () => void invalidate.afterTeams(qc, ctx.ns),
  });
}

/** Join by invite code. Errors: GuestRestrictedError, DataError 'team.code_not_found' | 'team.full' | 'team.too_many' | rate limit. */
export function useJoinByCode() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Team, Error, string>({
    mutationFn: (code) => send<Team>('POST', '/teams/join-by-code', { code: normalizeCode(code) }),
    onSuccess: () => void invalidate.afterTeams(qc, ctx.ns),
  });
}

/** Join a public team from Discover. */
export function useJoinTeam() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Team, Error, string>({
    mutationFn: (id) => send<Team>('POST', `/teams/${enc(id)}/join`),
    onSuccess: () => void invalidate.afterTeams(qc, ctx.ns),
  });
}

export function useLeaveTeam() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<void, Error, string>({
    mutationFn: (id) => send<void>('DELETE', `/teams/${enc(id)}/members/me`),
    onSuccess: () => void invalidate.afterTeams(qc, ctx.ns),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Team, Error, { id: string; patch: Partial<CreateTeamInput> & { goal_id?: string | null } }>({
    mutationFn: ({ id, patch }) => send<Team>('PATCH', `/teams/${enc(id)}`, patch),
    onSuccess: () => void invalidate.afterTeams(qc, ctx.ns),
  });
}

/** Invite code + link (`<origin>/join/<code>`). Members only; null until loaded. */
export function useInvite(teamId: string | null | undefined): Invite | null {
  const team = useTeam(teamId).data;
  if (!team?.code) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return { code: team.code, url: `${origin}/join/${team.code}` };
}

/** Team chat: REST, polled every 7 s while the screen is open (C8). */
export function useTeamMessages(teamId: string | null | undefined, enabled = true) {
  const ctx = useDataContext();
  return useQuery<ChatMessage[]>({
    queryKey: [...qk.team(ctx.ns, teamId ?? ''), 'messages'],
    enabled: ctx.ready && !!teamId && enabled,
    retry: shouldRetry,
    refetchInterval: 7000,
    queryFn: ({ signal }) => getJSON<ChatMessage[]>(`${API}/teams/${enc(teamId!)}/messages`, {}, signal),
  });
}

export function useSendMessage(teamId: string) {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<ChatMessage, Error, string>({
    mutationFn: (body) => send<ChatMessage>('POST', `/teams/${enc(teamId)}/messages`, { body }),
    onSuccess: (m) => qc.setQueryData<ChatMessage[]>([...qk.team(ctx.ns, teamId), 'messages'], (l) => [...(l ?? []), m]),
  });
}

/* ─────────────────────────── orgs ─────────────────────────── */

export function useOrg(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<Org | null>({
    queryKey: qk.org(ctx.ns, id ?? ''),
    enabled: ctx.ready && !!id,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<Org>(`${API}/orgs/${enc(id!)}`, {}, signal),
  });
}

export function useOrgs(q = '') {
  const ctx = useDataContext();
  return useQuery<Org[]>({
    queryKey: ['atmos', 'local', ctx.ns, 'org', 'list', q.trim().toLowerCase()],
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<Org[]>(`${API}/orgs`, { q: q.trim() || undefined }, signal),
  });
}

export function useCreateOrg() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Org, Error, { name: string; kind: OrgKind; city?: string | null; country?: string | null; description?: string | null; logo_emoji?: string | null }>({
    mutationFn: (input) => send<Org>('POST', '/orgs', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['atmos', 'local', ctx.ns, 'org'] }),
  });
}

/* ─────────────────────────── leaderboards, people ─────────────────────────── */

export type LeaderboardInput = { subject: LeaderboardSubject; scope: LeaderboardScope; period: Period; at?: LatLng | null };

/** People / Teams / Orgs × Area (3 km) / City / Country × week / month (calendar) / all. `me` = your row. */
export function useLeaderboard({ subject, scope, period, at }: LeaderboardInput) {
  const ctx = useDataContext();
  return useQuery<Leaderboard>({
    queryKey: [...qk.leaderboard(ctx.ns, subject, scope, period), at?.lat ?? null, at?.lng ?? null],
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<Leaderboard>(`${API}/leaderboard`, { subject, scope, period, lat: at?.lat, lng: at?.lng }, signal),
  });
}

export function useUserProfile(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<PublicProfile>({
    queryKey: ['atmos', 'local', ctx.ns, 'user', id ?? ''],
    enabled: ctx.ready && !!id,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<PublicProfile>(`${API}/users/${enc(id!)}`, {}, signal),
  });
}

/** Follow / unfollow a person or a team (C7). */
export function useFollow() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<{ following: boolean }, Error, { user_id?: string; team_id?: string; on: boolean }>({
    mutationFn: ({ on, ...target }) =>
      on ? send('POST', '/follows', target) : send('DELETE', `/follows?${new URLSearchParams(target as Record<string, string>).toString()}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.local(ctx.ns) }),
  });
}

export function useBlock() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<{ blocked: boolean }, Error, { user_id: string; on: boolean }>({
    mutationFn: ({ user_id, on }) => (on ? send('POST', '/blocks', { user_id }) : send('DELETE', `/blocks/${enc(user_id)}`)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.local(ctx.ns) }),
  });
}

export function useReport() {
  return useMutation<{ id: string }, Error, { target_type: ReportTarget; target_id: string; reason: ReportReason; note?: string | null }>({
    mutationFn: (input) => send('POST', '/reports', input),
  });
}

/* ─────────────────────────── feed, posts, comments ─────────────────────────── */

const feedKey = (ns: string, f: FeedFilter, extra: string) => ['atmos', 'local', ns, 'feed', f, extra] as const;

/** Feed by Area (3 km) / City / Following, or one person's or team's posts; 20 per page. */
export function useFeed(filter: FeedFilter, opts: { at?: LatLng | null; user_id?: string; team_id?: string } = {}) {
  const ctx = useDataContext();
  const extra = opts.user_id ? `u:${opts.user_id}` : opts.team_id ? `t:${opts.team_id}` : `${opts.at?.lat ?? ''},${opts.at?.lng ?? ''}`;
  return useInfiniteQuery<FeedPage>({
    queryKey: feedKey(ctx.ns, filter, extra),
    enabled: ctx.ready,
    retry: shouldRetry,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    queryFn: ({ pageParam, signal }) =>
      getJSON<FeedPage>(`${API}/feed`, { filter, lat: opts.at?.lat, lng: opts.at?.lng, before: (pageParam as string | null) ?? undefined, user_id: opts.user_id, team_id: opts.team_id }, signal),
  });
}

export type CreatePostInput = { body: string; photo?: Blob | null; team_id?: string | null; action_id?: string | null; tree_id?: string | null; share_photo?: boolean };

/** Post text and an optional photo (moderated before others see it). Share a verified action with `action_id` (C14). */
export function useCreatePost() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Post, Error, CreatePostInput>({
    mutationFn: async (input) => {
      const form = new FormData();
      form.set('body', input.body);
      if (input.team_id) form.set('team_id', input.team_id);
      if (input.action_id) form.set('action_id', input.action_id);
      if (input.tree_id) form.set('tree_id', input.tree_id);
      form.set('share_photo', String(input.share_photo ?? true));
      if (input.photo) form.set('photo', await photoForUpload(input.photo, 'camera'), 'photo.jpg');
      return postForm<Post>(`${API}/posts`, form);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['atmos', 'local', ctx.ns, 'feed'] }),
  });
}

export function usePost(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<Post & { comment_list: PostComment[] }>({
    queryKey: ['atmos', 'local', ctx.ns, 'post', id ?? ''],
    enabled: ctx.ready && !!id,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON(`${API}/posts/${enc(id!)}`, {}, signal),
  });
}

function useFeedRefresh() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return () => {
    void qc.invalidateQueries({ queryKey: ['atmos', 'local', ctx.ns, 'feed'] });
    void qc.invalidateQueries({ queryKey: ['atmos', 'local', ctx.ns, 'post'] });
  };
}

export function useLike() {
  const refresh = useFeedRefresh();
  return useMutation<{ likes: number; liked: boolean }, Error, { post_id: string; on: boolean }>({
    mutationFn: ({ post_id, on }) => send(on ? 'POST' : 'DELETE', `/posts/${enc(post_id)}/like`),
    onSuccess: refresh,
  });
}

/** Comment; write mentions as `@[Name](user-id)`. */
export function useAddComment() {
  const refresh = useFeedRefresh();
  return useMutation<PostComment, Error, { post_id: string; body: string }>({
    mutationFn: ({ post_id, body }) => send('POST', `/posts/${enc(post_id)}/comments`, { body }),
    onSuccess: refresh,
  });
}

export function useDeletePost() {
  const refresh = useFeedRefresh();
  return useMutation<void, Error, string>({ mutationFn: (id) => send('DELETE', `/posts/${enc(id)}`), onSuccess: refresh });
}

export function useDeleteComment() {
  const refresh = useFeedRefresh();
  return useMutation<void, Error, string>({ mutationFn: (id) => send('DELETE', `/comments/${enc(id)}`), onSuccess: refresh });
}

/* ─────────────────────────── events ─────────────────────────── */

export function useEvents(at: LatLng | null, past = false) {
  const ctx = useDataContext();
  return useQuery<CommunityEvent[]>({
    queryKey: ['atmos', 'local', ctx.ns, 'events', at?.lat ?? null, at?.lng ?? null, past],
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<CommunityEvent[]>(`${API}/events`, { lat: at?.lat, lng: at?.lng, past: past || undefined }, signal),
  });
}

export function useEvent(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<CommunityEvent>({
    queryKey: ['atmos', 'local', ctx.ns, 'events', 'one', id ?? ''],
    enabled: ctx.ready && !!id,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<CommunityEvent>(`${API}/events/${enc(id!)}`, {}, signal),
  });
}

export type CreateEventInput = {
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  place_name: string;
  lat: number;
  lng: number;
  team_id?: string | null;
  org_id?: string | null;
  sponsor_name?: string | null;
  capacity?: number | null;
};

function useEventsRefresh() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return () => void qc.invalidateQueries({ queryKey: ['atmos', 'local', ctx.ns, 'events'] });
}

export function useCreateEvent() {
  const refresh = useEventsRefresh();
  return useMutation<CommunityEvent, Error, CreateEventInput>({ mutationFn: (input) => send('POST', '/events', input), onSuccess: refresh });
}

export function useRsvp() {
  const refresh = useEventsRefresh();
  return useMutation<CommunityEvent, Error, { id: string; status: 'going' | 'maybe' | 'no' }>({
    mutationFn: ({ id, status }) => send('POST', `/events/${enc(id)}/rsvp`, { status }),
    onSuccess: refresh,
  });
}

/** Check in at the spot: GPS within 300 m, from 2 h before the start to 2 h after the end. */
export function useEventCheckin() {
  const refresh = useEventsRefresh();
  return useMutation<CommunityEvent, Error, { id: string; lat: number; lng: number; accuracy_m?: number | null }>({
    mutationFn: ({ id, ...body }) => send('POST', `/events/${enc(id)}/checkin`, body),
    onSuccess: refresh,
  });
}

export function useEventPhoto() {
  const refresh = useEventsRefresh();
  return useMutation<CommunityEvent, Error, { id: string; photo: Blob }>({
    mutationFn: async ({ id, photo }) => {
      const form = new FormData();
      form.set('photo', await photoForUpload(photo, 'camera'), 'group.jpg');
      return postForm<CommunityEvent>(`${API}/events/${enc(id)}/photo`, form);
    },
    onSuccess: refresh,
  });
}

/* ─────────────────────────── moderation ─────────────────────────── */

export function useModerationQueue(enabled: boolean) {
  const ctx = useDataContext();
  return useQuery<ModerationQueue>({
    queryKey: ['atmos', 'local', ctx.ns, 'moderation'],
    enabled: ctx.ready && enabled,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<ModerationQueue>(`${API}/moderation/queue`, {}, signal),
  });
}

export type ModerateInput = { report_id?: string | null; target_type: string; target_id: string; action: 'hide' | 'restore' | 'approve' | 'reject' | 'block' | 'unblock' | 'dismiss'; note?: string | null };

export function useModerate() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<{ ok: boolean }, Error, ModerateInput>({
    mutationFn: ({ report_id, ...body }) => send('POST', `/moderation/${report_id ? enc(report_id) : '-'}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.local(ctx.ns) }),
  });
}
