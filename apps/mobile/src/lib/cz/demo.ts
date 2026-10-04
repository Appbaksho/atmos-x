/**
 * Demo data from the CoolZone prototype. Screens that have no live backend yet (zones by street name,
 * goals, trees, teams, sensors…) read from here so the whole app tells one consistent story:
 * Nadia in Mohammadpur, Dhaka, cooling the Asad Gate block with the Hall Rooftop Crew.
 * Replace piece by piece as real endpoints land.
 */

export const USER = { first: 'Nadia', full: 'Nadia Rahman', bnFirst: 'নাদিয়া', urFirst: 'نادیہ' };

/** Unsplash photos used by the prototype (credited in the UI where shown large). */
const U = (id: string, w: number, h: number, extra = '') =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=70${extra}`;

export const PHOTO = {
  /** Aerial: trees and rooftops over a city */
  welcome: U('1628983065463-d59659ef4f18', 1000, 2000),
  /** Satellite-like basemap of Dhaka */
  basemap: (w = 900, h = 1800, extra = '') => U('1592396131156-0d1a9c1f6869', w, h, extra),
  /** Neighbourhood aerial (home hero, zone hero) */
  neighborhood: (w = 1000, h = 1000) => U('1688881577496-ed998541f3e4', w, h),
  /** Sapling close-up (camera, contribution, tree detail) */
  sapling: (w = 900, h = 1200) => U('1683994857980-280afa59a3f8', w, h),
  /** Plant nursery */
  nursery: (w = 240, h = 240, extra = '') => U('1523284998774-f6d3960be911', w, h, extra),
  /** Rice field (farmer) */
  field: (w = 900, h = 900) => U('1684691583342-0dfafc6942cf', w, h),
} as const;

export const CREDIT = {
  welcome: 'Photo by Zac Gudakov on Unsplash',
  basemap: 'Photo by Mahmud Ahsan on Unsplash',
  neighborhood: 'Photo by OWN FILTERS on Unsplash',
  sapling: 'Photo by Sehajpal Singh on Unsplash',
  nursery: 'Photo by Erwan Hesry on Unsplash',
  field: 'Photo by Kabiur Rahman Riyad on Unsplash',
} as const;

export type Zone = {
  id: string;
  name: string;
  score: number;
  /** Roof & road surface temperature, °C */
  lst: number;
  /** Distance label, metres */
  distM: number;
  img: string;
};

const ZI = '&crop=focalpoint';
export const ZONES: Zone[] = [
  { id: 'asad-gate', name: 'Asad Gate block', score: 86, lst: 52, distM: 180, img: U('1592396131156-0d1a9c1f6869', 440, 280, ZI + '&fp-x=.3&fp-y=.55&fp-z=2.2') },
  { id: 'ring-road-east', name: 'Ring Road east', score: 82, lst: 51, distM: 320, img: U('1628983065463-d59659ef4f18', 440, 280, ZI + '&fp-x=.7&fp-y=.4&fp-z=2') },
  { id: 'tajmahal-road', name: 'Tajmahal Road', score: 79, lst: 50, distM: 410, img: U('1592396131156-0d1a9c1f6869', 440, 280, ZI + '&fp-x=.75&fp-y=.72&fp-z=2.6') },
  { id: 'town-hall-market', name: 'Town Hall market', score: 74, lst: 48, distM: 460, img: U('1628983065463-d59659ef4f18', 440, 280, ZI + '&fp-x=.25&fp-y=.75&fp-z=2.2') },
  { id: 'shia-mosque-lane', name: 'Shia Mosque lane', score: 69, lst: 46, distM: 280, img: U('1688881577496-ed998541f3e4', 440, 280, ZI + '&fp-x=.5&fp-y=.65&fp-z=1.8') },
];
export const zoneById = (id?: string) => ZONES.find((z) => z.id === id) ?? ZONES[0];

/** The user's own zone. */
export const MY_ZONE = { ...ZONES[0], ownScore: 78, air: 34, feels: 41, humidity: 68, wind: 6, sealed: 78, green: 6, darkRoofs: 64 };

/** Active goal (Hall Rooftop Crew on Asad Gate block). */
export const GOAL = { zoneId: 'asad-gate', targetC: -1.5, by: '2 Oct 2027', pct: 38, modeledC: -0.42, team: 'Hall Rooftop Crew', teamId: 'hall-rooftop-crew', orgId: 'du-green-society' };

export type SpeciesKey = 'neem' | 'krish' | 'jarul' | 'arjun' | 'bokul' | 'aam';
export const SPECIES_NAMES: Record<'en' | 'bn' | 'ur', Record<SpeciesKey, string>> = {
  en: { neem: 'Neem', krish: 'Krishnachura', jarul: 'Jarul', arjun: 'Arjun', bokul: 'Bokul', aam: 'Mango' },
  bn: { neem: 'নিম', krish: 'কৃষ্ণচূড়া', jarul: 'জারুল', arjun: 'অর্জুন', bokul: 'বকুল', aam: 'আম' },
  ur: { neem: 'نیم', krish: 'گل مہر', jarul: 'جارول', arjun: 'ارجن', bokul: 'مولسری', aam: 'آم' },
};

export type MyTree = {
  name: string;
  id: string;
  sp: SpeciesKey;
  loc: string;
  /** Planted, ISO date */
  d: string;
  /** Last photo, ISO date */
  ph: string;
  /** Position on the contribution map, % */
  x: number;
  y: number;
};

export const DEMO_TREES: MyTree[] = [
  { name: 'Shanti', id: 'ATX-26-0001', sp: 'neem', loc: 'Asad Gate block', d: '2026-10-02', ph: '2026-10-02', x: 30, y: 70 },
  { name: 'Megh', id: 'ATX-26-0002', sp: 'neem', loc: 'Asad Gate block', d: '2026-10-02', ph: '2026-10-02', x: 40, y: 66 },
  { name: 'Chhaya', id: 'ATX-26-0003', sp: 'neem', loc: 'Asad Gate block', d: '2026-10-02', ph: '2026-10-02', x: 50, y: 62 },
  { name: 'Agun', id: 'ATX-26-0004', sp: 'krish', loc: 'Lalmatia Block D', d: '2026-09-14', ph: '2026-09-14', x: 74, y: 32 },
  { name: 'Beguni', id: 'ATX-26-0005', sp: 'jarul', loc: 'Hostel courtyard', d: '2026-08-18', ph: '2026-09-17', x: 22, y: 30 },
];

/** Every tree needs a photo every 15 days to keep earning points. */
export const PHOTO_EVERY_DAYS = 15;
/** "Today" for the demo story (keeps overdue maths stable). */
export const DEMO_TODAY = new Date('2026-10-02T00:00:00');

/** Days until the next photo is due (negative = overdue). */
export function photoDueIn(t: MyTree, today = DEMO_TODAY): number {
  const DAY = 864e5;
  return Math.round((new Date(t.ph + 'T00:00:00').getTime() + PHOTO_EVERY_DAYS * DAY - today.getTime()) / DAY);
}

export const PM_NOW = 62;
