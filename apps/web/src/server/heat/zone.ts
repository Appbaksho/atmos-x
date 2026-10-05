import 'server-only';

import type { I18nText, Locale, ZoneDetail, ZoneDrivers } from '@/lib/data/types';

import { explainZone } from '../ai/explain';
import { makeMeta, SRC, src } from '../meta';
import { snapshot } from '../snapshots';
import { round } from '../util';
import { getArchive, summarize } from '../weather/archive';
import { inBangladesh } from '../weather/bmd';
import { getForecast } from '../weather/forecast';
import { heatIndex } from '../weather/heat-index';
import { HEAT } from './config';
import { type Scan, scanForZone, type ScanZone, scanSources, zoneNames } from './scan';
import { type LandCover, landCoverTerm, whatIfGreen } from './score';

/** Reference green cover used to size the "low green" cause (30 %). */
const GREEN_REF = 0.3;
/** Assumed extra surface heat (°C) if every built surface had a dark roof. */
const DARK_ROOF_C = 2;

export function darkRoofPct(country: string | null): number {
  return HEAT.darkRoofPct[country ?? 'default'] ?? HEAT.darkRoofPct.default;
}

/** Top-3 causes as I18nText codes, with the estimated °C each adds (daytime coefficients). */
export function causesFor(cover: LandCover, darkRoof: number): I18nText[] {
  const c = HEAT.coef;
  const cands: { code: string; adds: number; params: Record<string, number> }[] = [
    { code: 'cause.sealed_surface', adds: c.built * cover.built, params: { pct: Math.round((cover.built + cover.road) * 100) } },
    { code: 'cause.wide_roads', adds: c.road * cover.road, params: { pct: Math.round(cover.road * 100) } },
    { code: 'cause.low_green', adds: -c.green * Math.max(0, GREEN_REF - cover.green), params: { pct: Math.round(cover.green * 100) } },
    { code: 'cause.dense_buildings', adds: c.density * Math.min(cover.density / HEAT.densityRef, 1), params: { per_ha: Math.round(cover.density) } },
    { code: 'cause.dark_roofs', adds: (DARK_ROOF_C * cover.built * darkRoof) / 100, params: { pct: darkRoof } },
  ];
  return cands
    .filter((x) => x.adds >= 0.1)
    .sort((a, b) => b.adds - a.adds)
    .slice(0, 3)
    .map((x) => ({ code: x.code, params: { ...x.params, adds_c: round(x.adds, 1) } }));
}

export function driversFor(z: ScanZone, scan: Scan, country: string | null): ZoneDrivers {
  const night = scan.tmin_c != null ? round(scan.tmin_c + landCoverTerm(z.cover, true), 1) : null;
  return {
    sealed_pct: Math.round((z.cover.built + z.cover.road) * 100),
    green_pct: Math.round(z.cover.green * 100),
    ndvi: null,
    dark_roof_pct: darkRoofPct(country),
    pop_density_km2: round(z.cover.density, 1),
    night_lst_c: night,
    estimated: ['dark_roof_pct', 'pop_density_km2', 'night_lst_c'],
  };
}

export async function getZoneDetail(id: string, lang: Locale, opts: { explain?: boolean } = {}): Promise<ZoneDetail | null> {
  const found = await scanForZone(id);
  if (!found || found.scan.method === 'synthetic') {
    const snap = snapshot<ZoneDetail>(`zone.${id}.${lang}`, null) ?? snapshot<ZoneDetail>(`zone.${id}.en`, null);
    if (snap) return { ...snap, meta: { ...snap.meta, live: false, generated_at: new Date().toISOString() } };
    if (!found) return null;
  }
  const { scan, zone } = found;
  const country = inBangladesh(zone.centroid) ? 'BD' : null;
  const [fc, ar] = await Promise.all([getForecast(zone.centroid).catch(() => null), getArchive(zone.centroid).catch(() => null)]);
  const air = fc ? fc.data.current.temp : scan.air_c;
  const feels = fc ? heatIndex(fc.data.current.temp, fc.data.current.rh) : scan.air_c;
  const drivers = driversFor(zone, scan, country);
  const causes = causesFor(zone.cover, drivers.dark_roof_pct ?? 0);
  const wi = whatIfGreen(zone.cover, scan.score_air_c ?? scan.air_c, scan.median_est_c, false);
  const what_if_green = { add_green_pct: Math.round(HEAT.whatIfGreen * 100), score_after: wi.score_after, lst_drop_c: wi.lst_drop_c };
  const name = zoneNames(scan, lang).get(zone.id) ?? zone.id;
  const hist = ar ? summarize(ar.data) : null;

  let why: string | null = null;
  if (opts.explain !== false && scan.method !== 'synthetic') {
    why = await explainZone(id, lang, {
      zone_name: name,
      heat_score: zone.score,
      est_surface_c: zone.lst_c,
      scan_median_est_c: round(scan.median_est_c, 1),
      air_c: round(air, 1),
      sealed_pct: drivers.sealed_pct,
      road_pct: Math.round(zone.cover.road * 100),
      green_pct: drivers.green_pct,
      water_pct: Math.round(zone.cover.water * 100),
      buildings_per_ha: Math.round(zone.cover.density),
      dark_roofs_pct_assumed: drivers.dark_roof_pct,
      top_causes: causes.map((c) => ({ cause: c.code.replace('cause.', ''), adds_c: Number(c.params?.adds_c ?? 0) })),
      what_if_green,
      night: scan.night,
    });
  }

  const sources = [...scanSources(scan)];
  if (ar) sources.push(src(SRC.archive, ar.data.end));
  if (why) sources.push(SRC.ai);
  return {
    id,
    name,
    score: zone.score,
    lst_c: zone.lst_c,
    air_c: round(air, 1),
    feels_c: round(feels, 1),
    centroid: zone.centroid,
    h3: zone.h3,
    drivers,
    causes,
    why_text: why,
    what_if_green,
    history: hist?.history ?? [],
    history_kind: 'air_temp',
    meta: makeMeta(scan.live && (fc?.live ?? false) && (ar?.live ?? true), sources),
  };
}
