/**
 * Basemap style for the heat map: OpenFreeMap "liberty" (OpenStreetMap data, no key) from
 * NEXT_PUBLIC_MAP_STYLE_URL, restyled toward the CoolZone navy/lime palette in dark mode (unless
 * NEXT_PUBLIC_MAP_STYLE_URL_DARK is set). Falls back to raster tile.openstreetmap.org if the vector
 * style can't be fetched.
 */
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

export const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
export const STYLE_URL_DARK = process.env.NEXT_PUBLIC_MAP_STYLE_URL_DARK || '';

/** Raster OSM fallback (prompt-v0 §4.2). */
export const RASTER_FALLBACK: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const cache = new Map<string, Promise<StyleSpecification>>();

async function fetchStyle(url: string): Promise<StyleSpecification> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`style ${res.status}`);
    return (await res.json()) as StyleSpecification;
  } finally {
    clearTimeout(t);
  }
}

/** The basemap style for a theme (cached per URL). */
export async function loadStyle(dark: boolean): Promise<StyleSpecification> {
  const url = dark && STYLE_URL_DARK ? STYLE_URL_DARK : STYLE_URL;
  let p = cache.get(url);
  if (!p) {
    p = fetchStyle(url);
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  try {
    const base = await p;
    return dark && !STYLE_URL_DARK ? darken(base) : base;
  } catch {
    return dark ? darken(RASTER_FALLBACK) : RASTER_FALLBACK;
  }
}

const has = (id: string, ...keys: string[]) => keys.some((k) => id.includes(k));

/** Runtime restyle of a light vector style toward navy / lime. */
export function darken(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map((l): LayerSpecification => {
    const id = l.id.toLowerCase();
    const paint = { ...(('paint' in l && l.paint) || {}) } as Record<string, unknown>;
    switch (l.type) {
      case 'background':
        paint['background-color'] = '#071C31';
        break;
      case 'fill':
        paint['fill-color'] = has(id, 'water', 'ocean', 'river', 'lake')
          ? '#0D2C4A'
          : has(id, 'park', 'wood', 'forest', 'grass', 'scrub', 'wetland', 'landcover', 'garden', 'pitch', 'cemetery')
            ? '#0E2E33'
            : has(id, 'building')
              ? '#14324F'
              : '#0A2239';
        paint['fill-outline-color'] = 'rgba(0,0,0,0)';
        if (has(id, 'building')) paint['fill-opacity'] = 0.9;
        break;
      case 'fill-extrusion':
        paint['fill-extrusion-color'] = '#14324F';
        paint['fill-extrusion-opacity'] = 0.7;
        break;
      case 'line':
        paint['line-color'] = has(id, 'water', 'river', 'canal', 'stream')
          ? '#174069'
          : has(id, 'casing')
            ? '#071C31'
            : has(id, 'boundary', 'admin')
              ? '#3A5470'
              : has(id, 'rail', 'transit')
                ? '#29435E'
                : has(id, 'motorway', 'trunk', 'primary')
                  ? '#2C5378'
                  : '#1C3B5A';
        break;
      case 'symbol':
        paint['text-color'] = has(id, 'water') ? '#6F8FB2' : '#A3B2C4';
        paint['text-halo-color'] = '#00182E';
        paint['text-halo-width'] = 1.2;
        paint['icon-opacity'] = 0.55;
        break;
      case 'raster':
        paint['raster-brightness-max'] = 0.55;
        paint['raster-saturation'] = -0.6;
        break;
      default:
        break;
    }
    return { ...l, paint } as LayerSpecification;
  });
  return { ...style, layers };
}
