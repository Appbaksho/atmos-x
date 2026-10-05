import 'server-only';

import { booleanPointInPolygon } from '@turf/turf';
import { cellArea, cellToBoundary, cellToLatLng, getResolution, gridDisk, latLngToCell } from 'h3-js';
import RBush from 'rbush';

import type { LatLng } from '@/lib/data/types';

import { overpass } from '../http';
import { bboxAround, haversineM, round } from '../util';
import { HEAT } from './config';
import type { LandCover } from './score';

/**
 * Land cover for a scan: one Overpass query (scan circle + 300 m buffer, as a bbox, which is much
 * faster on Overpass than `around`), projected to local metres, indexed in an R-tree, then sampled
 * on a 6×6 grid per H3 cell with point-in-polygon tests.
 */

type OsmGeomPt = { lat: number; lon: number };
type OsmTags = Record<string, string>;
type OsmEl =
  | { type: 'node'; id: number; lat: number; lon: number; tags?: OsmTags }
  | { type: 'way'; id: number; geometry?: OsmGeomPt[]; tags?: OsmTags }
  | { type: 'relation'; id: number; members?: { type: string; role: string; geometry?: OsmGeomPt[] }[]; tags?: OsmTags };
type OsmJson = { elements: OsmEl[] };

export type Names = Record<string, string>;

export type PlaceNode = { location: LatLng; names: Names; kind: string };

export type CellCover = LandCover & {
  h3: string;
  lat: number;
  lng: number;
  /** Sample hits per named road key (for zone naming) */
  roads?: Record<string, number>;
  buildings: number;
  trees: number;
};

export type CoverResult = {
  cells: CellCover[];
  places: PlaceNode[];
  roadNames: Record<string, Names>;
  counts: { buildings: number; roads: number; green: number; water: number; trees: number };
};

/** Local equirectangular projection around a centre (metres). */
export function projector(c: LatLng) {
  const kx = 111_320 * Math.cos((c.lat * Math.PI) / 180);
  const ky = 110_574;
  return {
    to: (lat: number, lng: number): [number, number] => [(lng - c.lng) * kx, (lat - c.lat) * ky],
    from: (x: number, y: number): LatLng => ({ lat: c.lat + y / ky, lng: c.lng + x / kx }),
  };
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };
type PolyItem = Box & { kind: 'building' | 'green' | 'water'; ring: [number, number][] };
type LineItem = Box & { kind: 'road' | 'green'; a: [number, number]; b: [number, number]; half: number; nameKey?: string };

function namesOf(tags: OsmTags | undefined): Names | null {
  if (!tags?.name) return null;
  const out: Names = { default: tags.name };
  for (const [k, v] of Object.entries(tags)) if (k.startsWith('name:') && k.length <= 8) out[k.slice(5)] = v;
  return out;
}

export function pickName(names: Names, lang: string): string {
  return names[lang] ?? names.default;
}

const GREEN_RE = {
  leisure: /^(park|garden|pitch|playground|nature_reserve)$/,
  landuse: /^(grass|forest|meadow|recreation_ground|village_green|orchard|cemetery|allotments)$/,
  natural: /^(wood|scrub|grassland|tree_row|heath)$/,
};
const WATER = (t: OsmTags) => t.natural === 'water' || t.waterway === 'riverbank' || /^(reservoir|basin)$/.test(t.landuse ?? '');
const GREEN = (t: OsmTags) => GREEN_RE.leisure.test(t.leisure ?? '') || GREEN_RE.landuse.test(t.landuse ?? '') || GREEN_RE.natural.test(t.natural ?? '');

/** Two queries run in parallel on Overpass: built surfaces (big) and green/water/trees/places (small). */
export function landCoverQueries(b: [number, number, number, number]): [string, string] {
  const head = `[out:json][timeout:25][bbox:${b.map((x) => x.toFixed(5)).join(',')}];`;
  return [
    `${head}
way["building"];out skel geom qt;
way["highway"];out tags geom qt;`,
    `${head}
(way["leisure"~"^(park|garden|pitch|playground|nature_reserve)$"];way["landuse"~"^(grass|forest|meadow|recreation_ground|village_green|orchard|cemetery|allotments)$"];way["natural"~"^(wood|scrub|grassland|tree_row|heath)$"];relation["leisure"~"^(park|garden)$"];relation["landuse"~"^(grass|forest|meadow|recreation_ground)$"];relation["natural"~"^(wood|scrub|grassland)$"];);out tags geom qt;
node["natural"="tree"];out skel qt;
(way["natural"="water"];way["waterway"="riverbank"];way["landuse"~"^(reservoir|basin)$"];relation["natural"="water"];relation["landuse"~"^(reservoir|basin)$"];);out tags geom qt;
node["place"~"^(neighbourhood|suburb|quarter)$"]["name"];out tags qt;`,
  ];
}

export async function fetchLandCover(center: LatLng, radiusM: number): Promise<OsmJson> {
  const [qa, qb] = landCoverQueries(bboxAround(center, radiusM + HEAT.bufferM));
  // 25 s budget (§4.6); the 1 km scan in a dense city is a ~15 MB answer, so it gets 30 s.
  const timeoutMs = radiusM > 700 ? 30_000 : 25_000;
  const [a, b] = await Promise.all([overpass<OsmJson>(qa, { timeoutMs }), overpass<OsmJson>(qb, { timeoutMs })]);
  return { elements: [...a.elements, ...b.elements] };
}

const closed = (g: OsmGeomPt[]) => g.length >= 4 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;

function boxOf(pts: [number, number][], pad = 0): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const inRing = (p: [number, number], ring: [number, number][]) => booleanPointInPolygon(p, { type: 'Polygon', coordinates: [ring] });

/** H3 cells of the scan circle (gridDisk around the centre, clipped to the circle). */
export function scanCells(center: LatLng, radiusM: number, res: number): string[] {
  const c0 = latLngToCell(center.lat, center.lng, res);
  const edge = Math.sqrt((2 * cellArea(c0, 'm2')) / (3 * Math.sqrt(3)));
  const k = Math.ceil(radiusM / (edge * Math.sqrt(3))) + 1;
  return gridDisk(c0, k).filter((h) => {
    const [lat, lng] = cellToLatLng(h);
    return haversineM(center, { lat, lng }) <= radiusM;
  });
}

/** Turn Overpass JSON into per-cell land-cover fractions. */
export function computeCover(osm: OsmJson, center: LatLng, cells: string[]): CoverResult {
  const proj = projector(center);
  const polys: PolyItem[] = [];
  const lines: LineItem[] = [];
  const places: PlaceNode[] = [];
  const roadNames: Record<string, Names> = {};
  const counts = { buildings: 0, roads: 0, green: 0, water: 0, trees: 0 };
  const res = cells.length ? getResolution(cells[0]) : 10;
  const cellSet = new Set(cells);
  const buildingsPerCell = new Map<string, number>();
  const treesPerCell = new Map<string, number>();

  const addPoly = (kind: PolyItem['kind'], g: OsmGeomPt[]) => {
    if (!closed(g)) return false;
    const ring = g.map((p) => proj.to(p.lat, p.lon));
    polys.push({ kind, ring, ...boxOf(ring) });
    return true;
  };
  const addLine = (kind: LineItem['kind'], g: OsmGeomPt[], half: number, nameKey?: string) => {
    for (let i = 1; i < g.length; i++) {
      const a = proj.to(g[i - 1].lat, g[i - 1].lon);
      const b = proj.to(g[i].lat, g[i].lon);
      lines.push({ kind, a, b, half, nameKey, ...boxOf([a, b], half) });
    }
  };

  for (const el of osm.elements) {
    if (el.type === 'node') {
      if (!el.tags) {
        counts.trees++;
        const h = latLngToCell(el.lat, el.lon, res);
        if (cellSet.has(h)) treesPerCell.set(h, (treesPerCell.get(h) ?? 0) + 1);
      } else if (el.tags.place) {
        const names = namesOf(el.tags);
        if (names) places.push({ location: { lat: el.lat, lng: el.lon }, names, kind: el.tags.place });
      }
      continue;
    }
    if (el.type === 'way') {
      const g = el.geometry;
      if (!g || g.length < 2) continue;
      const t = el.tags;
      if (!t) {
        // building (printed with `out skel`)
        if (addPoly('building', g)) {
          counts.buildings++;
          let sx = 0;
          let sy = 0;
          for (const p of g) {
            sx += p.lat;
            sy += p.lon;
          }
          const h = latLngToCell(sx / g.length, sy / g.length, res);
          if (cellSet.has(h)) buildingsPerCell.set(h, (buildingsPerCell.get(h) ?? 0) + 1);
        }
      } else if (t.highway) {
        if (HEAT.roadIgnore.has(t.highway) || t.area === 'yes') continue;
        const width = HEAT.roadWidthM[t.highway] ?? HEAT.roadWidthDefaultM;
        const names = namesOf(t);
        let nameKey: string | undefined;
        if (names) {
          nameKey = names.default;
          roadNames[nameKey] = { ...(roadNames[nameKey] ?? {}), ...names };
        }
        addLine('road', g, width / 2, nameKey);
        counts.roads++;
      } else if (WATER(t)) {
        if (addPoly('water', g)) counts.water++;
      } else if (GREEN(t)) {
        if (t.natural === 'tree_row' && !closed(g)) addLine('green', g, HEAT.treeRowHalfWidthM);
        else addPoly('green', g);
        counts.green++;
      }
      continue;
    }
    // relation: use outer members (inner holes ignored; documented approximation)
    const t = el.tags ?? {};
    const kind: PolyItem['kind'] | null = WATER(t) ? 'water' : GREEN(t) ? 'green' : null;
    if (!kind) continue;
    for (const m of el.members ?? []) if (m.role === 'outer' && m.geometry) addPoly(kind, m.geometry);
    if (kind === 'water') counts.water++;
    else counts.green++;
  }

  const polyTree = new RBush<PolyItem>();
  polyTree.load(polys);
  const lineTree = new RBush<LineItem>();
  lineTree.load(lines);

  const n = HEAT.samplesPerSide;
  const out: CellCover[] = cells.map((h) => {
    const boundary = cellToBoundary(h).map(([la, ln]) => proj.to(la, ln));
    const hexRing = [...boundary, boundary[0]];
    const bb = boxOf(boundary);
    let samples = 0;
    let built = 0;
    let road = 0;
    let green = 0;
    let water = 0;
    const roads: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p: [number, number] = [bb.minX + ((i + 0.5) / n) * (bb.maxX - bb.minX), bb.minY + ((j + 0.5) / n) * (bb.maxY - bb.minY)];
        if (!inRing(p, hexRing)) continue;
        samples++;
        const q = { minX: p[0], minY: p[1], maxX: p[0], maxY: p[1] };
        const ps = polyTree.search(q);
        if (ps.some((x) => x.kind === 'building' && inRing(p, x.ring))) {
          built++;
          continue;
        }
        if (ps.some((x) => x.kind === 'water' && inRing(p, x.ring))) {
          water++;
          continue;
        }
        const ls = lineTree.search(q);
        const hitRoad = ls.find((x) => x.kind === 'road' && segDist(p, x.a, x.b) <= x.half);
        if (hitRoad) {
          road++;
          if (hitRoad.nameKey) roads[hitRoad.nameKey] = (roads[hitRoad.nameKey] ?? 0) + 1;
          continue;
        }
        if (ps.some((x) => x.kind === 'green' && inRing(p, x.ring)) || ls.some((x) => x.kind === 'green' && segDist(p, x.a, x.b) <= x.half)) green++;
      }
    }
    const areaM2 = cellArea(h, 'm2');
    const s = Math.max(1, samples);
    const trees = treesPerCell.get(h) ?? 0;
    const buildings = buildingsPerCell.get(h) ?? 0;
    const [lat, lng] = cellToLatLng(h);
    return {
      h3: h,
      lat: round(lat, 6),
      lng: round(lng, 6),
      built: round(built / s, 3),
      road: round(road / s, 3),
      water: round(water / s, 3),
      green: round(Math.min(1, green / s + (trees * HEAT.treeCanopyM2) / areaM2), 3),
      density: round(buildings / (areaM2 / 10_000), 1),
      buildings,
      trees,
      ...(Object.keys(roads).length ? { roads } : {}),
    };
  });
  return { cells: out, places, roadNames, counts };
}
