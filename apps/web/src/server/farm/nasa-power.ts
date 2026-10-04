import 'server-only';

import type { LatLng } from '@/lib/data/types';

import { cached, HOUR } from '../cache';
import { fetchJSON } from '../http';
import { round } from '../util';

/**
 * NASA POWER daily point data (keyless), exactly the input farmer.ts uses: past-30-day rainfall.
 * Port of fetchPowerDaily from apps/mobile/src/lib/nasa.ts. Returns null on failure.
 */
const POWER = 'https://power.larc.nasa.gov/api/temporal';
const DAY = 24 * HOUR;
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

export type PowerDaily = { dates: string[]; tmax: (number | null)[]; tmean: (number | null)[]; rain: (number | null)[]; rh: (number | null)[] };

export async function fetchPowerDaily(p: LatLng, days = 30): Promise<PowerDaily | null> {
  const lat = round(p.lat, 2);
  const lon = round(p.lng, 2);
  const end = new Date(Date.now() - DAY);
  const start = new Date(end.getTime() - (days - 1) * DAY);
  try {
    const r = await cached(`power:${lat},${lon}:${days}:${ymd(end)}`, 6 * HOUR, async () => {
      const url =
        `${POWER}/daily/point?parameters=T2M_MAX,T2M,PRECTOTCORR,RH2M&community=AG` +
        `&longitude=${lon}&latitude=${lat}&start=${ymd(start)}&end=${ymd(end)}&format=JSON`;
      const j = await fetchJSON<{ properties: { parameter: Record<'T2M_MAX' | 'T2M' | 'PRECTOTCORR' | 'RH2M', Record<string, number>> } }>(url, {
        timeoutMs: 12_000,
        retries: 0,
      });
      const par = j.properties.parameter;
      const dates = Object.keys(par.T2M_MAX);
      const clean = (o: Record<string, number>) => dates.map((d) => (o[d] == null || o[d] <= -900 ? null : o[d]));
      return { dates, tmax: clean(par.T2M_MAX), tmean: clean(par.T2M), rain: clean(par.PRECTOTCORR), rh: clean(par.RH2M) };
    });
    return r.value;
  } catch {
    return null;
  }
}
