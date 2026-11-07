/**
 * Design photography from the CoolZone prototype (apps/mobile/src/lib/cz/demo.ts PHOTO/CREDIT).
 * These are decorative images, not data: no numbers come from here.
 */
const U = (id: string, w: number, h: number, extra = '') =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}${extra.includes('q=') ? '' : '&q=70'}${extra}`;

export const PHOTO = {
  /** Aerial: trees and rooftops over a city (S01). Phone-sized so the hero paints quickly (E18). */
  welcome: U('1628983065463-d59659ef4f18', 720, 1440, '&q=60'),
  /** Neighbourhood aerial (Home hero, goal task thumbnail) */
  neighborhood: (w = 1000, h = 1000) => U('1688881577496-ed998541f3e4', w, h),
} as const;

export const CREDIT = {
  welcome: 'Photo by Zac Gudakov on Unsplash',
  neighborhood: 'Photo by OWN FILTERS on Unsplash',
} as const;
