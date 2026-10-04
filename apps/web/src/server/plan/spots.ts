import 'server-only';

import { area as turfArea } from '@turf/turf';
import { cellToBoundary, getResolution, latLngToCell } from 'h3-js';

import type { LatLng, PlantingSpotFeature, PlantingSpotKind, PlantingSpots } from '@/lib/data/types';

import { cached, TTL } from '../cache';
import { overpass } from '../http';
import { makeMeta, SRC, src } from '../meta';
import { snapshot } from '../snapshots';
import { haversineM, round } from '../util';

/**
 * Planting spots for a zone from Overpass: open ground (grass, parks, brownfield, school / mosque /
 * temple grounds) minus the buildings standing on it, flat-ish roofs ≥ 80 m², and suggested
 * roadside tree pits every 25 m along named streets.
 */

type Pt = { lat: number; lon: number };
type El = { type: string; id: number; tags?: Record<string, string>; geometry?: Pt[] };

const MIN_ROOF_M2 = 80;
const ROADSIDE_STEP_M = 25;
const MAX_GROUND = 40;
const MAX_ROOFS = 60;
const MAX_ROADSIDE = 60;

function bboxOfCells(cells: string[], padM = 60): [number, number, number, number] {
  let s = 90;
  let w = 180;
  let n = -90;
  let e = -180;
  for (const c of cells)
    for (const [la, ln] of cellToBoundary(c)) {
      s = Math.min(s, la);
      n = Math.max(n, la);
      w = Math.min(w, ln);
      e = Math.max(e, ln);
    }
  const dLat = padM / 111_320;
  const dLng = padM / (111_320 * Math.cos(((s + n) / 2) * (Math.PI / 180)));
  return [s - dLat, w - dLng, n + dLat, e + dLng];
}

const closed = (g: Pt[]) => g.length >= 4 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
const ring = (g: Pt[]) => g.map((p) => [round(p.lon, 6), round(p.lat, 6)]);
const centroidOf = (g: Pt[]): LatLng => ({ lat: g.reduce((a, p) => a + p.lat, 0) / g.length, lng: g.reduce((a, p) => a + p.lon, 0) / g.length });
const areaOf = (g: Pt[]) => turfArea({ type: 'Polygon', coordinates: [ring(g)] });

function groundSuitability(t: Record<string, string>): number {
  if (/^(grass|greenfield|meadow|village_green)$/.test(t.landuse ?? '') || /^(park|garden)$/.test(t.leisure ?? '')) return 0.9;
  if (t.landuse === 'brownfield') return 0.75;
  if (t.leisure === 'playground' || t.leisure === 'pitch') return 0.5;
  return 0.6; // school, place of worship, hospital grounds: needs permission
}

export async function getPlantingSpots(zoneId: string, cells: string[]): Promise<PlantingSpots> {
  const cellSet = new Set(cells);
  const res = getResolution(cells[0]);
  const inZone = (p: LatLng) => cellSet.has(latLngToCell(p.lat, p.lng, res));
  const bb = bboxOfCells(cells).map((x) => x.toFixed(5)).join(',');
  try {
    const r = await cached(`spots:${zoneId}`, TTL.overpass, async () => {
      const q = `[out:json][timeout:25][bbox:${bb}];
(way["leisure"~"^(park|garden|playground|pitch)$"];way["landuse"~"^(grass|brownfield|greenfield|meadow|village_green|recreation_ground|religious)$"];way["amenity"~"^(school|place_of_worship|college|university|hospital)$"];way["natural"~"^(scrub|grassland)$"];);out tags geom qt;
way["building"];out tags geom qt;
way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street)$"];out tags geom qt;`;
      const j = await overpass<{ elements: El[] }>(q);
      return buildSpots(j.elements, inZone);
    });
    return { ...r.value, meta: makeMeta(r.fresh, [src(SRC.osm, r.at), SRC.model]) };
  } catch (e) {
    const snap = snapshot<PlantingSpots>(`spots.${zoneId}`, null);
    if (snap) return { ...snap, meta: { ...snap.meta, live: false } };
    throw e;
  }
}

export function buildSpots(elements: El[], inZone: (p: LatLng) => boolean): Omit<PlantingSpots, 'meta'> {
  const buildings = elements.filter((e) => e.tags?.building && e.geometry && closed(e.geometry));
  const ground: PlantingSpotFeature[] = [];
  const roofs: PlantingSpotFeature[] = [];
  const roadside: PlantingSpotFeature[] = [];
  let ground_m2 = 0;
  let roof_m2 = 0;
  let roadside_m = 0;

  const bCentroids = buildings.map((b) => ({ c: centroidOf(b.geometry as Pt[]), a: areaOf(b.geometry as Pt[]), b }));

  for (const e of elements) {
    const g = e.geometry;
    const t = e.tags ?? {};
    if (!g || t.building || t.highway || !closed(g)) continue;
    const c = centroidOf(g);
    if (!inZone(c)) continue;
    const total = areaOf(g);
    // subtract buildings whose centroid falls inside this ground polygon's bbox and within its radius
    const r = Math.sqrt(total / Math.PI);
    const built = bCentroids.filter((x) => haversineM(x.c, c) <= r).reduce((a, x) => a + x.a, 0);
    const open = Math.max(0, total - built);
    if (open < 20) continue;
    ground_m2 += open;
    ground.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring(g)] },
      properties: { id: `g-${e.id}`, kind: 'ground', area_m2: Math.round(open), suitability: round(groundSuitability(t) * Math.min(1, open / 200 + 0.4), 2), name: t.name ?? null },
    });
  }

  for (const { c, a, b } of bCentroids) {
    if (a < MIN_ROOF_M2 || !inZone(c)) continue;
    const shape = b.tags?.['roof:shape'];
    const suit = shape === 'flat' ? 0.9 : shape && shape !== 'flat' ? 0.3 : 0.7;
    roof_m2 += a;
    roofs.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring(b.geometry as Pt[])] },
      properties: { id: `r-${b.id}`, kind: 'roof', area_m2: Math.round(a), suitability: suit, name: b.tags?.name ?? null },
    });
  }

  for (const e of elements) {
    const g = e.geometry;
    if (!g || !e.tags?.highway) continue;
    let carry = 0;
    for (let i = 1; i < g.length; i++) {
      const a = { lat: g[i - 1].lat, lng: g[i - 1].lon };
      const b = { lat: g[i].lat, lng: g[i].lon };
      const len = haversineM(a, b);
      let d = ROADSIDE_STEP_M - carry;
      while (d <= len) {
        const f = d / len;
        const p = { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
        if (inZone(p)) {
          roadside_m += ROADSIDE_STEP_M;
          roadside.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [round(p.lng, 6), round(p.lat, 6)] },
            properties: { id: `p-${e.id}-${roadside.length}`, kind: 'roadside' as PlantingSpotKind, area_m2: 4, suitability: 0.6, name: e.tags?.name ?? null },
          });
        }
        d += ROADSIDE_STEP_M;
      }
      carry = len - (d - ROADSIDE_STEP_M);
    }
  }

  // Spread roadside suggestions evenly when there are many.
  const pick = <T>(xs: T[], n: number) => (xs.length <= n ? xs : xs.filter((_, i) => i % Math.ceil(xs.length / n) === 0).slice(0, n));
  ground.sort((a, b) => b.properties.area_m2 * b.properties.suitability - a.properties.area_m2 * a.properties.suitability);
  roofs.sort((a, b) => b.properties.area_m2 - a.properties.area_m2);
  return {
    type: 'FeatureCollection',
    features: [...ground.slice(0, MAX_GROUND), ...roofs.slice(0, MAX_ROOFS), ...pick(roadside, MAX_ROADSIDE)],
    totals: { ground_m2: Math.round(ground_m2), roof_m2: Math.round(roof_m2), roadside_m: Math.round(roadside_m) },
  };
}
