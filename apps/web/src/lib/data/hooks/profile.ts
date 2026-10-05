'use client';
/** Profile, prefs and the user's stats (points, level, badges). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { setPrefs, type Prefs } from '@/lib/prefs-store';

import { currentContext } from '../local/context';
import { getProfile, myStats, updateProfile } from '../local/profile';
import type { MyStats, Profile } from '../types';
import { useDataContext } from './context';
import { qk } from './keys';

/**
 * Device prefs from prefs-store (live). V0-1's prefs context wraps the same store; either works.
 * Returns [prefs, setPrefs].
 */
export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => Promise<Prefs>] {
  return [useDataContext().prefs, setPrefs];
}

/** Contract Profile = prefs + display name / home / avatar for this namespace. */
export function useProfile() {
  const ctx = useDataContext();
  const p = ctx.prefs;
  return useQuery<Profile>({
    queryKey: [...qk.profile(ctx.ns), p.lang, p.unit, p.area, p.theme, p.farmer_mode, p.ask_on, p.onboarded, p.radius_m, p.presentation, ctx.displayName],
    enabled: ctx.ready,
    queryFn: async () => getProfile(await currentContext()),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<void, Error, Partial<Profile>>({
    mutationFn: async (patch) => updateProfile(await currentContext(), patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.profile(ctx.ns) }),
  });
}

/** Points (verified + tree checks), provisional points (pending), level, badges, area rank. */
export function useMyStats() {
  const ctx = useDataContext();
  return useQuery<MyStats>({
    queryKey: qk.stats(ctx.ns),
    enabled: ctx.ready,
    queryFn: async () => myStats(await currentContext()),
  });
}
