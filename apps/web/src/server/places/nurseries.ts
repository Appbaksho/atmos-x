import 'server-only';

import type { LatLng, Nursery, NurseriesResponse, Source } from '@/lib/data/types';

import { cached, TTL } from '../cache';
import { env } from '../env';
import { overpass } from '../http';
import { makeMeta, SRC, src } from '../meta';
import { snapshot } from '../snapshots';
import { bboxAround, haversineM } from '../util';

/**
 * Nearby plant nurseries and garden centres from OpenStreetMap (port of apps/mobile/src/lib/nurseries.ts),
 * merged with the curated Dhaka list from apps/mobile/src/screens/act/nursery-data.ts.
 */

type El = { type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

/** Curated near Asad Gate. Coordinates are approximate (the prototype only had distances); flagged in `address`. */
const CURATED: { id: string; name: string; location: LatLng; hours: string; phone?: string }[] = [
  { id: 'curated-mohammadpur-krishi', name: 'Mohammadpur Krishi Nursery', location: { lat: 23.7655, lng: 90.3582 }, hours: 'Open · till 18:00' },
  { id: 'curated-agargaon-market', name: 'Agargaon Nursery Market', location: { lat: 23.7778, lng: 90.3772 }, hours: 'Open · till 19:00' },
  { id: 'curated-dhanmondi-lake', name: 'Dhanmondi Lake Nursery', location: { lat: 23.7478, lng: 90.3748 }, hours: 'Closes 17:00' },
];

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export async function getNurseries(p: LatLng, radiusM: number): Promise<NurseriesResponse> {
  const lat = Math.round(p.lat * 100) / 100;
  const lng = Math.round(p.lng * 100) / 100;
  const r = Math.round(radiusM);
  let osm: (Nursery & { low: boolean })[] = [];
  let live = true;
  const sources: Source[] = [];
  try {
    const res = await cached(`nurs:${lat},${lng}:${r}`, TTL.overpass, async () => {
      // A bbox query with tag filters is far faster on Overpass than `around` + a name regex over everything.
      const bb = bboxAround({ lat, lng }, r).map((x) => x.toFixed(4)).join(',');
      const q = `[out:json][timeout:20][bbox:${bb}];
(
  nwr["shop"~"^(garden_centre|garden|plant|nursery|florist)"];
  nwr["landuse"="plant_nursery"];
  nwr["shop"]["name"~"nursery|নার্সারি",i];
  nwr["landuse"]["name"~"nursery|নার্সারি",i];
);
out center tags 150;`;
      const j = await overpass<{ elements: El[] }>(q, { timeoutMs: 20_000, hedgeMs: 6_000 });
      const seen = new Set<string>();
      const out: (Nursery & { low: boolean })[] = [];
      for (const el of j.elements ?? []) {
        const loc = el.type === 'node' && el.lat != null && el.lon != null ? { lat: el.lat, lng: el.lon } : el.center ? { lat: el.center.lat, lng: el.center.lon } : null;
        if (!loc) continue;
        const t = el.tags ?? {};
        const name = t.name || t['name:en'] || t['name:bn'] || (t.landuse === 'plant_nursery' ? 'Plant nursery' : t.shop === 'florist' ? 'Florist' : 'Garden centre');
        const key = `${norm(name)}:${loc.lat.toFixed(3)}:${loc.lng.toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: `${el.type}/${el.id}`,
          name,
          location: loc,
          dist_m: 0,
          phone: t.phone || t['contact:phone'] || null,
          hours: t.opening_hours ?? null,
          osm_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
          address: [t['addr:street'], t['addr:city']].filter(Boolean).join(', ') || null,
          low: (t.shop === 'florist' || /flower|ফুল|pushp|পুষ্প/i.test(name)) && !/nursery|নার্সারি|garden/i.test(name),
        });
      }
      return out;
    });
    osm = res.value;
    live = res.fresh;
    sources.push(src(SRC.osm, res.at));
  } catch (e) {
    const snap = snapshot<NurseriesResponse>('nurseries', p);
    if (snap) return { ...snap, meta: { ...snap.meta, live: false } };
    if (haversineM(p, env.demo) > 15_000) throw e;
    live = false;
  }

  const all = osm.map((n) => ({ ...n, dist_m: Math.round(haversineM(p, n.location)) }));
  if (haversineM(p, env.demo) <= 15_000) {
    for (const c of CURATED) {
      if (all.some((n) => norm(n.name) === norm(c.name))) continue;
      all.push({ id: c.id, name: c.name, location: c.location, dist_m: Math.round(haversineM(p, c.location)), phone: null, hours: c.hours, osm_url: null, address: 'Dhaka (approximate location)', low: false });
    }
    sources.push(SRC.curated);
  }
  const nurseries: Nursery[] = all
    .filter((n) => n.dist_m <= radiusM * 1.2 || n.id.startsWith('curated-'))
    .sort((a, b) => a.dist_m * (a.low ? 3 : 1) - b.dist_m * (b.low ? 3 : 1))
    .slice(0, 40)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ low, ...n }) => n);
  return { nurseries, meta: makeMeta(live, sources) };
}
