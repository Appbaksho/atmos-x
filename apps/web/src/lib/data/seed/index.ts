/**
 * Seed data: the demo community (other people, teams, the DU Green Society org, leaderboards) and
 * Nadia's Presentation-mode story. This is the ONLY place demo numbers live (prompt-v0.md §4.4).
 * Regenerate the JSON with `node src/lib/data/seed/generate-seed.mjs`.
 */
import type { LatLng, Meta } from '../types';
import communityJson from './community.json';
import storyJson from './story.json';
import type { SeedCommunity, SeedOrg, SeedStory, SeedTeam } from './types';

export * from './types';
export { estimateRank, mergeBoard, type LiveRow } from './leaderboard';

export const COMMUNITY = communityJson as unknown as SeedCommunity;
export const STORY = storyJson as unknown as SeedStory;

/** Demo focus point (Mohammadpur, Dhaka). Callers pass it to location-taking hooks in Presentation mode. */
export const DEMO_POINT: LatLng = {
  lat: Number(process.env.NEXT_PUBLIC_DEMO_LAT) || 23.759,
  lng: Number(process.env.NEXT_PUBLIC_DEMO_LNG) || 90.359,
};

export const DEMO_USER_ID = STORY.user.id;
export const DEMO_NAMESPACE = 'demo';

export const seedTeamById = (id: string): SeedTeam | undefined => COMMUNITY.teams.find((t) => t.id === id);
export const seedTeamByCode = (code: string): SeedTeam | undefined => COMMUNITY.teams.find((t) => t.code === code);
export const seedOrgById = (id: string): SeedOrg | undefined => COMMUNITY.orgs.find((o) => o.id === id);

/** Meta for seed-backed responses (UI shows the "Demo community" source chip). */
export function seedMeta(): Meta {
  return { live: false, generated_at: new Date().toISOString(), sources: [{ id: 'demo-community', name: 'Demo community' }] };
}

/** Meta for data that lives on this device. */
export function localMeta(): Meta {
  return { live: true, generated_at: new Date().toISOString(), sources: [{ id: 'device', name: 'This device' }] };
}
