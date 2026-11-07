'use client';
/** Profile, prefs and the user's stats (points, level, badges). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, call } from '@/lib/api/client';
import { setPrefs, type Prefs } from '@/lib/prefs-store';

import { currentContext } from '../local/context';
import { myStats } from '../local/profile';
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

/**
 * Contract Profile from GET /me/profile. Device prefs (lang, units, theme, …) render from the local
 * store first and mirror to the server through the data context.
 */
export function useProfile() {
  const ctx = useDataContext();
  const p = ctx.prefs;
  return useQuery<Profile>({
    queryKey: [...qk.profile(ctx.ns), p.lang, p.unit, p.area, p.theme, p.farmer_mode, p.ask_on, p.onboarded, p.radius_m, p.presentation, ctx.displayName],
    enabled: ctx.ready && !ctx.offline,
    queryFn: async ({ signal }) => {
      const s = await call(api.GET('/api/v1/me/profile', { signal }));
      return {
        display_name: s.display_name,
        avatar_url: s.avatar_url ?? null,
        home: s.home ?? null,
        radius_m: p.radius_m,
        lang: p.lang,
        unit: p.unit,
        area: p.area,
        theme: p.theme,
        farmer_mode: p.farmer_mode,
        ask_on: p.ask_on,
        onboarded: p.onboarded,
        presentation: ctx.presentation,
        bio: s.bio ?? null,
        area_label: s.area ?? null,
      };
    },
  });
}

const PREF_KEYS = ['radius_m', 'lang', 'unit', 'area', 'theme', 'farmer_mode', 'ask_on', 'onboarded', 'presentation'] as const;

/** Prefs go through the device store (mirrored to the server); name, bio, area and home go to PATCH /me/profile. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<void, Error, Partial<Profile>>({
    mutationFn: async (patch) => {
      await currentContext();
      const prefPatch: Partial<Prefs> = {};
      for (const k of PREF_KEYS) if (patch[k] !== undefined) (prefPatch as Record<string, unknown>)[k] = patch[k];
      const body: Record<string, unknown> = {};
      if (patch.display_name !== undefined) body.display_name = patch.display_name;
      if (patch.bio !== undefined) body.bio = patch.bio;
      if (patch.area_label !== undefined) body.area = patch.area_label;
      if (patch.home !== undefined) {
        if (patch.home) body.home = patch.home;
        else body.clear_home = true;
      }
      if (Object.keys(body).length) await call(api.PATCH('/api/v1/me/profile', { body }));
      if (Object.keys(prefPatch).length) await setPrefs(prefPatch);
    },
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
