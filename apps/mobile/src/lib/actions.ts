/**
 * Cooling action catalogue.
 *
 * Cooling coefficients are deliberately conservative, order-of-magnitude
 * estimates drawn from published urban-heat literature:
 *  - Every +1 % tree canopy in a 1 km² area lowers daytime LST by roughly
 *    0.1–0.2 °C (e.g. Ziter et al. 2019 PNAS; Schwaab et al. 2021). One mature
 *    street tree ≈ 50 m² crown, so 200 trees ≈ 1 % of a km² → ~0.12 °C.
 *  - Cool / white roofs: raising roof albedo across ~1 % of a km² gives
 *    ~0.03–0.05 °C at neighbourhood scale (Santamouris 2014 review).
 * Keep these in sync with `public.action_types` in supabase/migrations.
 */
export type ActionType = {
  id: string;
  title: string;
  unit: string;
  emoji: string;
  points: number; // per unit
  /** Estimated °C reduction contributed to a 1 km² zone, per unit */
  coolingPerUnit: number;
  description: string;
  isTree?: boolean;
};

export const ACTIONS: ActionType[] = [
  {
    id: 'plant_tree',
    title: 'Plant a tree',
    unit: 'tree',
    emoji: '🌳',
    points: 50,
    coolingPerUnit: 0.0006,
    isTree: true,
    description: 'Native shade trees (neem, krishnachura, mango, jarul) give the biggest long-term cooling.',
  },
  {
    id: 'plant_shrubs',
    title: 'Plant shrubs / pots',
    unit: '10 plants',
    emoji: '🪴',
    points: 12,
    coolingPerUnit: 0.0001,
    description: 'Balcony pots, hedges and shrubs add shade and evaporative cooling.',
  },
  {
    id: 'rooftop_garden',
    title: 'Rooftop garden',
    unit: '10 m²',
    emoji: '🏡',
    points: 40,
    coolingPerUnit: 0.0003,
    description: 'Green roofs insulate the building below and cool the air above.',
  },
  {
    id: 'cool_roof',
    title: 'Cool / white roof',
    unit: '10 m²',
    emoji: '⬜',
    points: 30,
    coolingPerUnit: 0.0004,
    description: 'Reflective lime or white coating on tin and concrete roofs bounces sunlight back.',
  },
  {
    id: 'green_wall',
    title: 'Green wall / creeper',
    unit: '5 m²',
    emoji: '🌿',
    points: 20,
    coolingPerUnit: 0.00015,
    description: 'Creepers on sun-facing walls cut wall temperature by several degrees.',
  },
  {
    id: 'shade_structure',
    title: 'Shade canopy',
    unit: 'structure',
    emoji: '⛱️',
    points: 25,
    coolingPerUnit: 0.0002,
    description: 'Shade cloth or canopies over bus stops, markets and play areas.',
  },
  {
    id: 'water_tree',
    title: 'Water & care for trees',
    unit: 'session',
    emoji: '💧',
    points: 5,
    coolingPerUnit: 0,
    description: 'Young trees need regular watering to survive the dry season.',
  },
  {
    id: 'awareness',
    title: 'Run an awareness event',
    unit: 'event',
    emoji: '📣',
    points: 30,
    coolingPerUnit: 0,
    description: 'Talk to neighbours, schools or your office about heat safety and greening.',
  },
];

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<
  string,
  ActionType
>;

export const TREE_COOLING_PER_KM2 = ACTION_BY_ID.plant_tree.coolingPerUnit;
export const ROOF_COOLING_PER_KM2 = ACTION_BY_ID.cool_roof.coolingPerUnit;

export type Level = { level: number; name: string; min: number; next: number | null };

const LEVELS = [
  { name: 'Seedling', min: 0 },
  { name: 'Sapling', min: 200 },
  { name: 'Shade Maker', min: 600 },
  { name: 'Canopy Keeper', min: 1500 },
  { name: 'Heat Breaker', min: 4000 },
  { name: 'Climate Guardian', min: 10000 },
];

export function levelFor(points: number): Level {
  let idx = 0;
  LEVELS.forEach((l, i) => {
    if (points >= l.min) idx = i;
  });
  return {
    level: idx + 1,
    name: LEVELS[idx].name,
    min: LEVELS[idx].min,
    next: LEVELS[idx + 1]?.min ?? null,
  };
}

export type Badge = { id: string; emoji: string; title: string; earned: boolean };

export function badgesFor(stats: { trees: number; actions: number; points: number; clans: number }): Badge[] {
  return [
    { id: 'first', emoji: '🌱', title: 'First action', earned: stats.actions >= 1 },
    { id: 'trees10', emoji: '🌳', title: '10 trees', earned: stats.trees >= 10 },
    { id: 'trees100', emoji: '🌲', title: '100 trees', earned: stats.trees >= 100 },
    { id: 'clan', emoji: '🤝', title: 'Joined a clan', earned: stats.clans >= 1 },
    { id: 'p1000', emoji: '🔥', title: '1,000 points', earned: stats.points >= 1000 },
    { id: 'streak', emoji: '⚡', title: '25 actions', earned: stats.actions >= 25 },
  ];
}
