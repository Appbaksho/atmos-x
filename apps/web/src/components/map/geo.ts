/**
 * Geometry helpers for the heat map (client): H3 cells → GeoJSON, scan circle, distances.
 * Pure functions, no React.
 */
import { cellArea, cellToBoundary, cellsToMultiPolygon } from 'h3-js';

import { heatColor } from '@/components/cz/tokens';
import type { HexCell, LatLng, ZoneSummary } from '@/lib/data/types';

type Position = [number, number];
type Ring = Position[];

export type HexProps = { h3: string; score: number; lst_c: number; color: string; order: number; zone: string };
export type HexFeature = { type: 'Feature'; id: number; geometry: { type: 'Polygon'; coordinates: Ring[] }; properties: HexProps };
export type ZoneFeature = {
  type: 'Feature';
  geometry: { type: 'MultiPolygon'; coordinates: Ring[][] };
  properties: { id: string; rank: number; score: number; near_tie: boolean };
};
export type FC<F> = { type: 'FeatureCollection'; features: F[] };

const closeRing = (r: Ring): Ring => (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) ? [...r, r[0]] : r);

/**
 * Hex cells as GeoJSON polygons. `order` (0–1) sorts cells by score so the scan animation can fade
 * them in from coolest to hottest; `zone` is the id of the zone the cell belongs to ('' if none).
 */
export function hexCollection(hexes: HexCell[], zones: ZoneSummary[]): FC<HexFeature> {
  const zoneOf = new Map<string, string>();
  for (const z of zones) for (const h of z.h3) zoneOf.set(h, z.id);
  const sorted = [...hexes].sort((a, b) => a.score - b.score);
  const rank = new Map(sorted.map((h, i) => [h.h3, sorted.length > 1 ? i / (sorted.length - 1) : 1]));
  return {
    type: 'FeatureCollection',
    features: hexes.map((h, i) => ({
      type: 'Feature',
      id: i,
      geometry: { type: 'Polygon', coordinates: [closeRing(cellToBoundary(h.h3, true) as Ring)] },
      properties: { h3: h.h3, score: h.score, lst_c: h.lst_c, color: heatColor(h.score), order: rank.get(h.h3) ?? 1, zone: zoneOf.get(h.h3) ?? '' },
    })),
  };
}

/** Zone outlines (merged cells). */
export function zoneCollection(zones: ZoneSummary[]): FC<ZoneFeature> {
  return {
    type: 'FeatureCollection',
    features: zones
      .filter((z) => z.h3.length)
      .map((z) => ({
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates: (cellsToMultiPolygon(z.h3, true) as Ring[][]).map((poly) => poly.map(closeRing)) },
        properties: { id: z.id, rank: z.rank, score: z.score, near_tie: z.near_tie },
      })),
  };
}

/** Circle polygon (GeoJSON, [lng, lat]) around a point. */
export function circlePolygon(c: LatLng, radiusM: number, steps = 72): { type: 'Feature'; geometry: { type: 'Polygon'; coordinates: Ring[] }; properties: Record<string, never> } {
  const ring: Ring = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([c.lng + dLng * Math.cos(a), c.lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} };
}

/** [[west, south], [east, north]] around a circle. */
export function circleBounds(c: LatLng, radiusM: number): [[number, number], [number, number]] {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  return [
    [c.lng - dLng, c.lat - dLat],
    [c.lng + dLng, c.lat + dLat],
  ];
}

/** Bounds of a set of H3 cells. */
export function cellsBounds(cells: string[]): [[number, number], [number, number]] | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const h of cells) {
    for (const [lng, lat] of cellToBoundary(h, true)) {
      w = Math.min(w, lng);
      e = Math.max(e, lng);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
  }
  return Number.isFinite(w) ? [
    [w, s],
    [e, n],
  ] : null;
}

/** Great-circle distance in metres. */
export function distM(a: LatLng, b: LatLng): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(h));
}

/** Total area of H3 cells (m²). */
export function cellsAreaM2(cells: string[]): number {
  return cells.reduce((a, h) => a + cellArea(h, 'm2'), 0);
}

/** H3 resolution the server uses for a scan radius (prompt-v0 §5.1). */
export const resForRadius = (r: number) => (r <= 300 ? 11 : 10);
/** Approximate number of H3 cells in a scan circle. */
export function cellCount(radiusM: number): number {
  const avg = resForRadius(radiusM) === 11 ? 2_150 : 15_047;
  return Math.max(1, Math.round((Math.PI * radiusM * radiusM) / avg));
}

/**
 * Hex cells projected into an SVG box (for small zone thumbnails). Returns polygon point strings
 * in a `size`×`size` viewBox, padded.
 */
export function cellsToSvg(cells: { h3: string; score: number }[], size = 100, pad = 8, minSpanDeg = 0.0045): { pts: string; score: number }[] {
  const rings = cells.map((c) => ({ ring: cellToBoundary(c.h3, true) as Ring, score: c.score }));
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const { ring } of rings)
    for (const [x, y] of ring) {
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
  if (!Number.isFinite(w)) return [];
  const midLat = ((s + n) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat);
  const spanX = (e - w) * kx;
  const spanY = n - s;
  const k = (size - pad * 2) / Math.max(spanX, spanY, minSpanDeg);
  const ox = (size - spanX * k) / 2;
  const oy = (size - spanY * k) / 2;
  return rings.map(({ ring, score }) => ({
    score,
    pts: ring.map(([x, y]) => `${(ox + (x - w) * kx * k).toFixed(1)},${(oy + (n - y) * k).toFixed(1)}`).join(' '),
  }));
}
