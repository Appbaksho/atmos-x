import 'server-only';

import type { Meta, Source } from '@/lib/data/types';

import { nowIso } from './util';

/** Source chips shown by the UI (meta.sources). Never label anything NASA unless it is. */
export const SRC = {
  openMeteo: { id: 'open-meteo', name: 'Open-Meteo', url: 'https://open-meteo.com' },
  archive: { id: 'open-meteo-archive', name: 'Open-Meteo archive (ERA5)', url: 'https://open-meteo.com/en/docs/historical-weather-api' },
  airQuality: { id: 'open-meteo-air', name: 'Open-Meteo Air Quality (CAMS)', url: 'https://open-meteo.com/en/docs/air-quality-api' },
  geocoding: { id: 'open-meteo-geocoding', name: 'Open-Meteo Geocoding', url: 'https://open-meteo.com/en/docs/geocoding-api' },
  osm: { id: 'osm', name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' },
  nominatim: { id: 'nominatim', name: 'OpenStreetMap Nominatim', url: 'https://nominatim.org' },
  heatProxy: { id: 'heat-proxy', name: 'Heat estimate: OpenStreetMap land cover + live weather' },
  bmd: { id: 'bmd-thresholds', name: 'BMD heat-wave thresholds (not an official warning)' },
  nasaPower: { id: 'nasa-power', name: 'NASA POWER', url: 'https://power.larc.nasa.gov' },
  ai: { id: 'ai', name: 'AI estimate' },
  curated: { id: 'curated', name: 'Atmos X curated list' },
  model: { id: 'atmos-model', name: 'Atmos X cooling model (estimate)' },
  synthetic: { id: 'synthetic', name: 'Synthetic heat field (offline fallback)' },
} as const satisfies Record<string, Source>;

export function src(s: Source, asOf?: string | number | null): Source {
  if (asOf == null) return { ...s };
  return { ...s, as_of: typeof asOf === 'number' ? new Date(asOf).toISOString() : asOf };
}

export function makeMeta(live: boolean, sources: Source[]): Meta {
  const seen = new Set<string>();
  const uniq = sources.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  return { live, generated_at: nowIso(), sources: uniq };
}
