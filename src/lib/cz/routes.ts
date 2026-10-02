/**
 * Prototype screen IDs → Expo Router paths. Screens navigate with `go('S06')` so cross-links stay
 * stable no matter which file a screen lives in.
 */
import { router, type Href } from 'expo-router';

export const ROUTES = {
  S01: '/onboarding/welcome',
  S02: '/onboarding/language',
  S03: '/onboarding/location',
  S04: '/(tabs)',
  S05: '/(tabs)/map',
  S06: '/zone/asad-gate',
  S07: '/zone/projection',
  S08: '/goal/new',
  S09: '/goal/feasibility',
  S10: '/(tabs)/plan',
  S11: '/species/neem',
  S12: '/nurseries',
  S13: '/budget',
  S14: '/log-action',
  S15: '/contribution',
  S16: '/(tabs)/community',
  S17: '/team/hall-rooftop-crew',
  S18: '/org/du-green-society',
  S19: '/team/new',
  S20: '/(tabs)/profile',
  S21: '/notifications',
  S22: '/settings',
  S26: '/air',
  S27: '/air/devices',
  S28: '/air/add',
  F01: '/(tabs)',
  F02: '/farm/alert',
  F03: '/(tabs)/map',
} as const;

export type ScreenId = keyof typeof ROUTES;

const TABS = new Set<ScreenId>(['S04', 'S05', 'S10', 'S16', 'S20', 'F01', 'F03']);

/** Navigate to a prototype screen. Tab roots are switched to, everything else is pushed. */
export function go(id: ScreenId) {
  const href = ROUTES[id] as Href;
  if (TABS.has(id)) router.navigate(href);
  else router.push(href);
}

/** Push a concrete path (for dynamic routes, e.g. `/zone/ring-road-east`). */
export function goPath(path: string) {
  router.push(path as Href);
}

/** Back, falling back to Home when there is no history (deep links). */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace(ROUTES.S04 as Href);
}
