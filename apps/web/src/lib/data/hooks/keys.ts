/**
 * Query-key factory. Everything is under ['atmos', …]:
 *   ['atmos', 'server', <endpoint>, …params]  server-backed (lang included where the route takes it)
 *   ['atmos', 'local', <ns>, <collection>, …]  device data, per namespace (user:<id> | demo | guest)
 * Invalidate a prefix to refresh a whole family, e.g. qk.leaderboards(ns) covers every board.
 */
import type { QueryClient } from '@tanstack/react-query';

import type { LatLng, LeaderboardScope, LeaderboardSubject, Locale, Period } from '../types';

/** ~11 m: keeps keys stable while GPS jitters. */
const r = (n: number) => Math.round(n * 1e4) / 1e4;
const pt = (p: LatLng) => [r(p.lat), r(p.lng)] as const;

export const qk = {
  all: ['atmos'] as const,

  /* server */
  server: () => ['atmos', 'server'] as const,
  conditions: (p: LatLng, lang: Locale) => ['atmos', 'server', 'conditions', ...pt(p), lang] as const,
  geoReverse: (p: LatLng, lang: Locale) => ['atmos', 'server', 'geo-reverse', ...pt(p), lang] as const,
  geoSearch: (q: string, lang: Locale) => ['atmos', 'server', 'geo-search', q.trim().toLowerCase(), lang] as const,
  zones: (p: LatLng, radius_m: number, lang: Locale) => ['atmos', 'server', 'zones', ...pt(p), radius_m, lang] as const,
  zone: (id: string, lang: Locale) => ['atmos', 'server', 'zone', id, lang] as const,
  projection: (id: string, a: { trees: number; roof_m2: number; shade: number }) =>
    ['atmos', 'server', 'projection', id, a.trees, a.roof_m2, a.shade] as const,
  plantingSpots: (id: string) => ['atmos', 'server', 'planting-spots', id] as const,
  plan: (goalId: string, sig: string, lang: Locale) => ['atmos', 'server', 'plan', goalId, sig, lang] as const,
  species: (p: LatLng | null, lang: Locale) => ['atmos', 'server', 'species', ...(p ? pt(p) : [null, null]), lang] as const,
  speciesOne: (id: string, p: LatLng | null, lang: Locale) => ['atmos', 'server', 'species-one', id, ...(p ? pt(p) : [null, null]), lang] as const,
  nurseries: (p: LatLng, radius_m: number) => ['atmos', 'server', 'nurseries', ...pt(p), radius_m] as const,
  /** Air is fetched from the server but merged with this namespace's sensors. */
  air: (ns: string, p: LatLng) => ['atmos', 'local', ns, 'air', ...pt(p)] as const,
  farmAlerts: (p: LatLng, crop: string, stage: string, lang: Locale) => ['atmos', 'server', 'farm-alerts', ...pt(p), crop, stage, lang] as const,

  /* local (per namespace) */
  local: (ns: string) => ['atmos', 'local', ns] as const,
  accounts: () => ['atmos', 'accounts'] as const,
  profile: (ns: string) => ['atmos', 'local', ns, 'profile'] as const,
  stats: (ns: string) => ['atmos', 'local', ns, 'stats'] as const,
  actions: (ns: string) => ['atmos', 'local', ns, 'actions'] as const,
  action: (ns: string, id: string) => ['atmos', 'local', ns, 'actions', id] as const,
  goals: (ns: string) => ['atmos', 'local', ns, 'goals'] as const,
  trees: (ns: string) => ['atmos', 'local', ns, 'trees'] as const,
  tree: (ns: string, id: string) => ['atmos', 'local', ns, 'trees', id] as const,
  notifications: (ns: string) => ['atmos', 'local', ns, 'notifications'] as const,
  teams: (ns: string) => ['atmos', 'local', ns, 'teams'] as const,
  team: (ns: string, id: string) => ['atmos', 'local', ns, 'teams', 'id', id] as const,
  teamByCode: (ns: string, code: string) => ['atmos', 'local', ns, 'teams', 'code', code] as const,
  org: (ns: string, id: string) => ['atmos', 'local', ns, 'org', id] as const,
  leaderboards: (ns: string) => ['atmos', 'local', ns, 'leaderboard'] as const,
  leaderboard: (ns: string, subject: LeaderboardSubject, scope: LeaderboardScope, period: Period) =>
    ['atmos', 'local', ns, 'leaderboard', subject, scope, period] as const,
  fields: (ns: string) => ['atmos', 'local', ns, 'fields'] as const,
  sensors: (ns: string) => ['atmos', 'local', ns, 'sensors'] as const,
  askRemaining: (ns: string) => ['atmos', 'local', ns, 'ask-remaining'] as const,
};

function invalidateAll(qc: QueryClient, keys: readonly (readonly unknown[])[]) {
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

/** Everything that moves when points change (log action, confirm, tree check, join/leave team). */
export function invalidateScore(qc: QueryClient, ns: string) {
  return invalidateAll(qc, [qk.actions(ns), qk.stats(ns), qk.leaderboards(ns), qk.goals(ns), qk.notifications(ns), qk.teams(ns), ['atmos', 'local', ns, 'org']]);
}

export const invalidate = {
  afterAction: (qc: QueryClient, ns: string) => invalidateAll(qc, [qk.trees(ns)]).then(() => invalidateScore(qc, ns)),
  afterTreeCheck: (qc: QueryClient, ns: string) => invalidateAll(qc, [qk.trees(ns), qk.stats(ns), qk.leaderboards(ns), qk.notifications(ns)]),
  afterTeams: (qc: QueryClient, ns: string) => invalidateScore(qc, ns),
  goals: (qc: QueryClient, ns: string) => invalidateAll(qc, [qk.goals(ns), qk.notifications(ns)]),
  /** Session / namespace switched: drop all device data for that namespace. */
  namespace: (qc: QueryClient, ns: string) => qc.invalidateQueries({ queryKey: qk.local(ns) }),
};
