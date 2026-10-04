import 'server-only';

import { cellArea, cellToLatLng, isValidCell, latLngToCell } from 'h3-js';

import type { LatLng, Locale, Source, ZonesScan } from '@/lib/data/types';

import { cached, peek, put, TTL } from '../cache';
import { serverT } from '../i18n';
import { makeMeta, SRC, src } from '../meta';
import { snapshot } from '../snapshots';
import { errMsg, haversineM, logTiming, round } from '../util';
import { getForecast, localHour } from '../weather/forecast';
import { h3ResFor, HEAT, radiusBucket } from './config';
import { type CellCover, computeCover, type CoverResult, fetchLandCover, type Names, pickName, scanCells } from './landcover';
import { clusterHotCells, isNight, type LandCover, meanCover, nearTies, type ScoredCell, scoreCells } from './score';
import { syntheticCover } from './synthetic';

export type ScanCell = CellCover & { est_c: number; score: number };

export type ScanZone = {
  id: string;
  rank: number;
  score: number;
  lst_c: number;
  centroid: LatLng;
  dist_m: number;
  near_tie: boolean;
  h3: string[];
  names: Names | null;
  cover: LandCover;
  area_km2: number;
};

export type Scan = {
  key: string;
  center: LatLng;
  radius_m: number;
  res: number;
  method: 'osm-proxy' | 'synthetic';
  air_c: number;
  tmin_c: number | null;
  local_hour: number;
  night: boolean;
  median_est_c: number;
  cells: ScanCell[];
  zones: ScanZone[];
  my_zone_id: string | null;
  /** live data (false = synthetic or stale) */
  live: boolean;
  at: number;
  forecast_at: number;
  osm_at: number | null;
};

const ckey = (c: LatLng) => `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;

/** Snap the scan centre to ~11 m so nearby requests share the cache. */
export function normCenter(c: LatLng): LatLng {
  return { lat: Math.round(c.lat * 1e4) / 1e4, lng: Math.round(c.lng * 1e4) / 1e4 };
}

export function zoneId(h3: string, radius: number): string {
  return `z-${h3}-${radius}`;
}

export function parseZoneId(id: string): { h3: string; radius: number } | null {
  const m = /^z-([0-9a-f]{15})-(\d{3,4})$/.exec(id);
  return m && isValidCell(m[1]) ? { h3: m[1], radius: Number(m[2]) } : null;
}

function nameZone(cells: ScoredCell[], centroid: LatLng, cover: CoverResult | null): Names | null {
  if (!cover) return null;
  const near = cover.places
    .map((p) => ({ p, d: haversineM(p.location, centroid) }))
    .sort((a, b) => a.d - b.d);
  if (near[0] && near[0].d <= 250) return near[0].p.names;
  const roadHits = new Map<string, number>();
  for (const c of cells as (ScoredCell & { roads?: Record<string, number> })[]) {
    for (const [k, v] of Object.entries(c.roads ?? {})) roadHits.set(k, (roadHits.get(k) ?? 0) + v);
  }
  const best = [...roadHits.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && cover.roadNames[best[0]]) return cover.roadNames[best[0]];
  if (near[0] && near[0].d <= 1500) return near[0].p.names;
  return null;
}

function buildScan(
  center: LatLng,
  radius: number,
  res: number,
  coverCells: CellCover[],
  cover: CoverResult | null,
  wx: { air: number; tmin: number | null; hour: number; at: number },
  method: Scan['method'],
  osmAt: number | null,
): Scan {
  const night = isNight(wx.hour);
  const { cells, median_est_c } = scoreCells(coverCells, wx.air, night);
  const clusters = clusterHotCells(cells).slice(0, HEAT.maxZones);
  const ties = nearTies(clusters.map((c) => c.score));
  const zones: ScanZone[] = clusters.map((cl, i) => {
    const centroid = {
      lat: round(cl.cells.reduce((a, c) => a + (c as ScanCell).lat, 0) / cl.cells.length, 6),
      lng: round(cl.cells.reduce((a, c) => a + (c as ScanCell).lng, 0) / cl.cells.length, 6),
    };
    return {
      id: zoneId(latLngToCell(centroid.lat, centroid.lng, res), radius),
      rank: i + 1,
      score: cl.score,
      lst_c: cl.est_c,
      centroid,
      dist_m: Math.round(haversineM(center, centroid)),
      near_tie: ties[i],
      h3: cl.cells.map((c) => c.h3),
      names: nameZone(cl.cells, centroid, cover),
      cover: meanCover(cl.cells),
      area_km2: round(cl.cells.reduce((a, c) => a + cellArea(c.h3, 'km2'), 0), 4),
    };
  });
  const centerCell = latLngToCell(center.lat, center.lng, res);
  const mine =
    zones.find((z) => z.h3.includes(centerCell)) ??
    [...zones].sort((a, b) => a.dist_m - b.dist_m)[0];
  return {
    key: `${ckey(center)}:${radius}`,
    center,
    radius_m: radius,
    res,
    method,
    air_c: round(wx.air, 1),
    tmin_c: wx.tmin,
    local_hour: wx.hour,
    night,
    median_est_c,
    cells: cells as ScanCell[],
    zones,
    my_zone_id: mine?.id ?? null,
    live: method === 'osm-proxy',
    at: Date.now(),
    forecast_at: wx.at,
    osm_at: osmAt,
  };
}

class SyntheticScan extends Error {
  scan: Scan;
  constructor(scan: Scan) {
    super('land cover unavailable; synthetic field');
    this.scan = scan;
  }
}

async function weatherFor(center: LatLng) {
  const fc = await getForecast(center);
  return {
    air: fc.data.current.temp,
    tmin: fc.data.daily[0]?.tmin ?? null,
    hour: localHour(fc.data),
    at: fc.at,
    live: fc.live,
  };
}

/** Is the land cover for this scan already cached (no Overpass call needed)? */
export async function scanIsWarm(center: LatLng, radiusM: number): Promise<boolean> {
  const c = normCenter(center);
  const r = radiusBucket(radiusM);
  const e = await peek(`lc:${ckey(c)}:${r}`);
  return !!e?.fresh;
}

/**
 * Run (or load) a scan. Land cover is cached 7 days, the scored scan 30 minutes (air temperature
 * changes). Falls back to the synthetic field when Overpass fails.
 */
export async function runScan(centerIn: LatLng, radiusM: number): Promise<{ scan: Scan; cold: boolean; error?: string }> {
  const t0 = performance.now();
  const center = normCenter(centerIn);
  const radius = radiusBucket(radiusM);
  const res = h3ResFor(radius);
  const key = `${ckey(center)}:${radius}`;
  let cold = false;
  let error: string | undefined;
  let scan: Scan;
  try {
    const r = await cached(`scan:${key}`, TTL.scan, async () => {
      const cells = scanCells(center, radius, res);
      const wxP = weatherFor(center);
      wxP.catch(() => {}); // awaited below; avoid an unhandled rejection while Overpass runs
      let cover: CoverResult | null = null;
      let osmAt: number | null = null;
      try {
        const lc = await cached(`lc:${key}`, TTL.overpass, async () => {
          cold = true;
          const t1 = performance.now();
          const osm = await fetchLandCover(center, radius);
          logTiming('zones.overpass', t1, `${osm.elements.length} elements`);
          const t2 = performance.now();
          const out = computeCover(osm, center, cells);
          logTiming('zones.landcover', t2, `${cells.length} cells`);
          return out;
        });
        cover = lc.value;
        osmAt = lc.at;
      } catch (e) {
        error = errMsg(e);
      }
      const wx = await wxP;
      if (!cover) throw new SyntheticScan(buildScan(center, radius, res, syntheticCover(center, radius, cells), null, wx, 'synthetic', null));
      const built = buildScan(center, radius, res, cover.cells, cover, wx, 'osm-proxy', osmAt);
      built.live = wx.live;
      return built;
    });
    scan = r.fresh ? r.value : { ...r.value, live: false };
  } catch (e) {
    if (!(e instanceof SyntheticScan)) throw e;
    // Synthetic scans are never cached: the next request retries live.
    scan = e.scan;
  }
  for (const z of scan.zones) await put(`zoneidx:${z.id}`, { lat: scan.center.lat, lng: scan.center.lng, r: scan.radius_m }, TTL.overpass);
  logTiming('zones.scan', t0, `${cold ? 'cold' : 'warm'} r=${radius} res=${res} zones=${scan.zones.length} method=${scan.method}${error ? ` error=${error.slice(0, 200)}` : ''}`);
  return { scan, cold, error };
}

function zoneName(z: ScanZone, lang: Locale): string {
  return z.names ? pickName(z.names, lang) : serverT(lang, 'zone.unnamed', { n: z.rank });
}

/** Zone names for a language, with duplicates disambiguated ("Mohammadpur", "Mohammadpur 2"). */
export function zoneNames(scan: Scan, lang: Locale): Map<string, string> {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const z of scan.zones) {
    const base = zoneName(z, lang);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.set(z.id, n > 1 ? `${base} ${n}` : base);
  }
  return out;
}

export function scanSources(scan: Scan): Source[] {
  return scan.method === 'synthetic'
    ? [SRC.synthetic, src(SRC.openMeteo, scan.forecast_at)]
    : [SRC.heatProxy, src(SRC.osm, scan.osm_at), src(SRC.openMeteo, scan.forecast_at)];
}

export function scanResponse(scan: Scan, lang: Locale): ZonesScan {
  const names = zoneNames(scan, lang);
  return {
    scan: {
      center: scan.center,
      radius_m: scan.radius_m,
      h3_res: scan.res,
      acquired: { lst_date: null, ndvi_date: null },
      baseline_lst_c: round(scan.median_est_c, 1),
      method: scan.method,
    },
    hexes: scan.cells.map((c) => ({ h3: c.h3, score: c.score, lst_c: round(c.est_c, 1) })),
    zones: scan.zones.map((z) => ({
      id: z.id,
      name: names.get(z.id) ?? z.id,
      score: z.score,
      lst_c: z.lst_c,
      dist_m: z.dist_m,
      rank: z.rank,
      near_tie: z.near_tie,
      centroid: z.centroid,
      h3: z.h3,
    })),
    my_zone_id: scan.my_zone_id,
    meta: makeMeta(scan.live, scanSources(scan)),
  };
}

/** GET /zones: live scan → (Overpass down) Dhaka snapshot within 1 km of the demo point → synthetic. */
export async function getZones(center: LatLng, radiusM: number, lang: Locale): Promise<ZonesScan> {
  const { scan } = await runScan(center, radiusM);
  if (scan.method === 'synthetic') {
    const r = radiusBucket(radiusM);
    const bucket = r <= 300 ? 300 : r <= 700 ? 500 : 1000;
    const snap = snapshot<ZonesScan>(`zones.${bucket}.${lang}`, center, 1) ?? snapshot<ZonesScan>(`zones.${bucket}.en`, center, 1);
    if (snap) return { ...snap, meta: { ...snap.meta, live: false, generated_at: new Date().toISOString() } };
  }
  return scanResponse(scan, lang);
}

/** Find the scan that produced a zone id (cache index, else re-scan around the zone's cell). */
export async function scanForZone(id: string): Promise<{ scan: Scan; zone: ScanZone } | null> {
  const parsed = parseZoneId(id);
  if (!parsed) return null;
  const idx = await peek<{ lat: number; lng: number; r: number }>(`zoneidx:${id}`);
  const [clat, clng] = cellToLatLng(parsed.h3);
  const center = idx ? { lat: idx.value.lat, lng: idx.value.lng } : { lat: clat, lng: clng };
  const { scan } = await runScan(center, idx?.value.r ?? parsed.radius);
  const zone =
    scan.zones.find((z) => z.id === id) ??
    scan.zones.find((z) => z.h3.includes(parsed.h3)) ??
    [...scan.zones].sort((a, b) => haversineM(a.centroid, { lat: clat, lng: clng }) - haversineM(b.centroid, { lat: clat, lng: clng }))[0];
  return zone ? { scan, zone } : null;
}
