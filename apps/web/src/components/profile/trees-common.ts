'use client';
/** Shared "My trees" helpers (S20 list, tree detail): status chip, species names. */
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { B, useCz, useLocation } from '@/components/cz';
import { daysUntilDue, useSpecies } from '@/lib/data/hooks';
import type { SpeciesSummary, Tree } from '@/lib/data/types';

import { humanize } from './codes';

export type TreeChip = { label: string; bg: string; fg: string; urgent: boolean; overdue: boolean; days: number };

/** State chip for a tree (T3 state from the server, with the days to the next check-in). */
export function useTreeChip() {
  const t = useTranslations('profile.trees');
  const { c, f } = useCz();
  return useCallback(
    (tree: Pick<Tree, 'next_due_at' | 'state'>): TreeChip => {
      const n = daysUntilDue(tree.next_due_at);
      switch (tree.state) {
        case 'verifying':
          return { label: t('state.verifying'), bg: c.soft, fg: c.ink, urgent: false, overdue: false, days: n };
        case 'lost':
          return { label: t('state.lost'), bg: c.soft, fg: c.ink2, urgent: false, overdue: false, days: n };
        case 'at_risk':
          return { label: t('state.at_risk'), bg: B.deepRed, fg: B.white, urgent: true, overdue: n < 0, days: n };
        case 'needs_water':
          return { label: t('state.needs_water'), bg: B.orange, fg: B.navy, urgent: true, overdue: n < 0, days: n };
        case 'due':
          if (n < 0) return { label: t('od', { count: -n, n: f.loc(-n) }), bg: B.orange, fg: B.navy, urgent: true, overdue: true, days: n };
          if (n === 0) return { label: t('today'), bg: B.orange, fg: B.navy, urgent: true, overdue: false, days: n };
          return { label: t('soon', { count: n, n: f.loc(n) }), bg: 'rgba(242,154,56,0.22)', fg: c.ink, urgent: true, overdue: false, days: n };
        default:
          return { label: t('ok', { count: n, n: f.loc(n) }), bg: c.limeSoft, fg: c.ink, urgent: false, overdue: false, days: n };
      }
    },
    [t, c, f],
  );
}

/** Species list for the focus point (curated Bangladesh list, AI shortlist elsewhere). */
export function useSpeciesList(): SpeciesSummary[] | undefined {
  const { focus } = useLocation();
  return useSpecies(focus).data?.species;
}

/** Species display name: V0-6 copy first (en/bn/ur), then the server list, then the humanised id. */
export function useSpeciesName() {
  const t = useTranslations('profile.sp');
  const list = useSpeciesList();
  return useCallback(
    (id: string): string => {
      if (t.has(id)) return t(id);
      const s = list?.find((x) => x.id === id);
      return s?.name || s?.local_name || humanize(id);
    },
    [t, list],
  );
}

export function useScientific() {
  const list = useSpeciesList();
  return useCallback((id: string) => list?.find((x) => x.id === id)?.scientific ?? null, [list]);
}

/** Display name of a tree (nickname, else species). */
export function treeLabel(tree: Pick<Tree, 'nickname' | 'species_id'>, speciesName: (id: string) => string) {
  return tree.nickname?.trim() || speciesName(tree.species_id);
}

/** Fallback species when the server list isn't available (the prototype's six). */
export const FALLBACK_SPECIES = ['neem', 'krish', 'jarul', 'arjun', 'bokul', 'aam'];
