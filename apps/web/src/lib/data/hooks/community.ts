'use client';
/** Teams, invites, orgs and leaderboards: seed community merged with the user's live points. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createTeam,
  getOrg,
  getTeam,
  inviteFor,
  joinByCode,
  leaderboard,
  leaveTeam,
  myTeams,
  risingTeams,
  teamByCode,
  type CreateTeamInput,
} from '../local/community';
import { currentContext } from '../local/context';
import { normalizeCode } from '../local/teams-logic';
import type { Invite, Leaderboard, LeaderboardScope, LeaderboardSubject, Org, Period, RisingTeam, Team } from '../types';
import { useDataContext } from './context';
import { invalidate, qk } from './keys';

export { MAX_TEAM_MEMBERS, MIN_TEAM_MEMBERS } from '../local/teams-logic';
export type { CreateTeamInput };

/** Teams the user created or joined (guests: []). */
export function useTeams() {
  const ctx = useDataContext();
  return useQuery<Team[]>({
    queryKey: qk.teams(ctx.ns),
    enabled: ctx.ready,
    queryFn: async () => myTeams(await currentContext()),
  });
}

/** Any team: seed (e.g. 'hall-rooftop-crew') or created on this device. `null` when unknown. */
export function useTeam(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<Team | null>({
    queryKey: qk.team(ctx.ns, id ?? ''),
    enabled: ctx.ready && !!id,
    queryFn: async () => getTeam(await currentContext(), id!),
  });
}

/** Invite landing (/join/[code]): look the team up without joining. Works for guests. */
export function useTeamByCode(code: string | null | undefined) {
  const ctx = useDataContext();
  const c = code ? normalizeCode(code) : '';
  return useQuery<Team | null>({
    queryKey: qk.teamByCode(ctx.ns, c),
    enabled: ctx.ready && !!c,
    queryFn: async () => teamByCode(await currentContext(), c),
  });
}

/** Create a team (2–5 members). Guests: GuestRestrictedError. */
export function useCreateTeam() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Team, Error, CreateTeamInput>({
    mutationFn: async (input) => createTeam(await currentContext(), input),
    onSuccess: () => void invalidate.afterTeams(qc, ctx.ns),
  });
}

/**
 * Join by invite code (dash optional, case-insensitive). Errors: GuestRestrictedError,
 * DataError 'team.invalid_code' | 'team.full' (5 members) | 'team.already_member'.
 */
export function useJoinByCode() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<Team, Error, string>({
    mutationFn: async (code) => joinByCode(await currentContext(), code),
    onSuccess: () => void invalidate.afterTeams(qc, ctx.ns),
  });
}

export function useLeaveTeam() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => leaveTeam(await currentContext(), id),
    onSuccess: () => void invalidate.afterTeams(qc, ctx.ns),
  });
}

/** Invite code + link (`<origin>/join/<code>`) for the QR / share sheet. null until the team loads. */
export function useInvite(teamId: string | null | undefined): Invite | null {
  const team = useTeam(teamId).data;
  return team ? inviteFor(team) : null;
}

export function useOrg(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<Org | null>({
    queryKey: qk.org(ctx.ns, id ?? ''),
    enabled: ctx.ready && !!id,
    queryFn: async () => getOrg(await currentContext(), id!),
  });
}

export type LeaderboardInput = { subject: LeaderboardSubject; scope: LeaderboardScope; period: Period };

/** People / Teams / Orgs × Area / City / Country × week / month / all. `me` = your row (may be below the top 10). */
export function useLeaderboard({ subject, scope, period }: LeaderboardInput) {
  const ctx = useDataContext();
  return useQuery<Leaderboard>({
    queryKey: qk.leaderboard(ctx.ns, subject, scope, period),
    enabled: ctx.ready,
    queryFn: async () => leaderboard(await currentContext(), { subject, scope, period }),
  });
}

/** The "Rising board" on S16 (seed). */
export function useRisingTeams(): RisingTeam[] {
  return risingTeams();
}
