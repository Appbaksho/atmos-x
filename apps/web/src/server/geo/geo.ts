import 'server-only';

import type { GeoSearchResponse, LatLng, Locale, Place, ReverseGeocode } from '@/lib/data/types';

import { cached, TTL } from '../cache';
import { fetchJSON, spaced } from '../http';
import { makeMeta, SRC, src } from '../meta';
import { snapshot } from '../snapshots';
import { inBangladesh } from '../weather/bmd';
import { cellKey } from '../util';

/** Nominatim reverse geocoding (≤ 1 request/s, cached 30 days) and Open-Meteo city search. */

const nominatimQueue = spaced(1100);

type NominatimReverse = {
  name?: string;
  address?: Record<string, string>;
  display_name?: string;
};

export type ReverseResult = Omit<ReverseGeocode, 'meta'>;

export async function reverseGeocode(p: LatLng, lang: Locale): Promise<{ data: ReverseResult; live: boolean; at: number }> {
  const key = `rev:${cellKey(p.lat, p.lng, 0.005)}:${lang}`;
  try {
    const r = await cached(key, TTL.geo, () =>
      nominatimQueue(async () => {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=16&addressdetails=1&accept-language=${lang},en`;
        const j = await fetchJSON<NominatimReverse>(url, { timeoutMs: 6000 });
        const a = j.address ?? {};
        const local = a.suburb || a.city_district || a.quarter || a.neighbourhood || a.village || a.town || j.name || '';
        const cityRaw = a.city || a.town || a.village || a.county || a.state_district || a.state || null;
        const city = cityRaw ? cityRaw.replace(/\s+(Metropolitan|District|Division|মহানগর|জেলা|বিভাগ)$/u, '') : null;
        const place = [local, city].filter((x, i, arr) => x && arr.indexOf(x) === i).join(', ') || j.display_name?.split(',').slice(0, 2).join(',') || '';
        return { place, city, country: a.country ?? null, country_code: a.country_code ? a.country_code.toUpperCase() : null };
      }),
    );
    return { data: r.value, live: r.fresh, at: r.at };
  } catch (e) {
    const snap = snapshot<ReverseGeocode>(`reverse.${lang}`, p) ?? snapshot<ReverseGeocode>('reverse.en', p);
    if (snap) {
      const { meta: _m, ...data } = snap;
      void _m;
      return { data, live: false, at: Date.now() };
    }
    throw e;
  }
}

export async function reverseResponse(p: LatLng, lang: Locale): Promise<ReverseGeocode> {
  const r = await reverseGeocode(p, lang);
  return { ...r.data, meta: makeMeta(r.live, [src(SRC.nominatim, r.at), SRC.osm]) };
}

/** Country code without a network call when we can (Bangladesh), else Nominatim. */
export async function countryOf(p: LatLng): Promise<string | null> {
  if (inBangladesh(p)) return 'BD';
  try {
    return (await reverseGeocode(p, 'en')).data.country_code;
  } catch {
    return null;
  }
}

/** Short place label ("Mohammadpur, Dhaka") or coordinates if geocoding fails. */
export async function placeLabel(p: LatLng, lang: Locale): Promise<string> {
  try {
    const r = await reverseGeocode(p, lang);
    if (r.data.place) return r.data.place;
  } catch {
    // fall through
  }
  return `${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}`;
}

type OmGeocode = {
  results?: { name: string; latitude: number; longitude: number; country?: string; country_code?: string; admin1?: string; admin2?: string }[];
};

export async function searchPlaces(q: string, lang: Locale): Promise<GeoSearchResponse> {
  const query = q.trim().slice(0, 80);
  const key = `geosearch:${lang}:${query.toLowerCase()}`;
  const r = await cached(key, TTL.geo, async () => {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=${lang}&format=json`;
    const j = await fetchJSON<OmGeocode>(url, { timeoutMs: 6000 });
    return (j.results ?? []).map(
      (x): Place => ({
        name: x.name,
        admin: x.admin1 ?? x.admin2 ?? null,
        country: x.country ?? null,
        country_code: x.country_code ?? null,
        location: { lat: x.latitude, lng: x.longitude },
      }),
    );
  });
  return { results: r.value, meta: makeMeta(r.fresh, [src(SRC.geocoding, r.at)]) };
}
