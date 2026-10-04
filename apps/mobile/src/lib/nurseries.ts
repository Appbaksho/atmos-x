/**
 * Nearby plant nurseries and garden centres from OpenStreetMap (Overpass API).
 */
import { Linking, Platform } from 'react-native';
import { cached, HOUR } from './http';
import { LatLng, haversineKm } from './geo';

export type Nursery = {
  id: string;
  name: string;
  location: LatLng;
  distanceKm: number;
  kind: string;
  phone?: string;
  address?: string;
  hours?: string;
};

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function overpass(query: string): Promise<any> {
  let lastErr: unknown;
  for (const url of MIRRORS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AtmosX/1.0' },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not reach OpenStreetMap.');
}

export async function fetchNurseries(p: LatLng, radiusKm = 15): Promise<Nursery[]> {
  const lat = Math.round(p.latitude * 100) / 100;
  const lon = Math.round(p.longitude * 100) / 100;
  const r = Math.round(radiusKm * 1000);
  return cached(`nurs:${lat}:${lon}:${r}`, 24 * HOUR, async () => {
    const q = `[out:json][timeout:25];
(
  nwr["shop"="garden_centre"](around:${r},${lat},${lon});
  nwr["landuse"="plant_nursery"](around:${r},${lat},${lon});
  nwr["shop"~"^(garden|plant|nursery)"](around:${r},${lat},${lon});
  nwr["name"~"[Nn]ursery|নার্সারি"](around:${r},${lat},${lon});
);
out center 80;`;
    const j = await overpass(q);
    const seen = new Set<string>();
    const out: Nursery[] = [];
    for (const el of j.elements ?? []) {
      const loc =
        el.type === 'node'
          ? { latitude: el.lat, longitude: el.lon }
          : el.center
            ? { latitude: el.center.lat, longitude: el.center.lon }
            : null;
      if (!loc) continue;
      const t = el.tags ?? {};
      const name = t.name || t['name:en'] || t['name:bn'] || (t.landuse === 'plant_nursery' ? 'Plant nursery' : 'Garden centre');
      const key = `${name}:${loc.latitude.toFixed(3)}:${loc.longitude.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `${el.type}/${el.id}`,
        name,
        location: loc,
        distanceKm: haversineKm({ latitude: lat, longitude: lon }, loc),
        kind: t.shop === 'garden_centre' ? 'Garden centre' : t.landuse === 'plant_nursery' ? 'Nursery' : 'Plant shop',
        phone: t.phone || t['contact:phone'],
        address: [t['addr:street'], t['addr:city']].filter(Boolean).join(', ') || undefined,
        hours: t.opening_hours,
      });
    }
    return out.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 40);
  });
}

export function openDirections(to: LatLng, label: string) {
  const { latitude, longitude } = to;
  const url = Platform.select({
    ios: `maps:0,0?q=${encodeURIComponent(label)}&ll=${latitude},${longitude}`,
    android: `geo:0,0?q=${latitude},${longitude}(${encodeURIComponent(label)})`,
    default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
  });
  Linking.openURL(url!).catch(() =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`),
  );
}
