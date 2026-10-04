import 'server-only';

import type { Air, LatLng } from '@/lib/data/types';

import { cached, TTL } from '../cache';
import { fetchJSON } from '../http';
import { makeMeta, SRC, src } from '../meta';
import { snapshot } from '../snapshots';
import { cellKey, mean, round } from '../util';
import { airAdvice, aqiCategory, aqiPm10, aqiPm25 } from './aqi';

/** Open-Meteo Air Quality (CAMS model): current PM2.5/PM10 + 5-day daily means; AQI computed by us. */

type Raw = {
  current: { time: string; pm2_5: number | null; pm10: number | null };
  hourly: { time: string[]; pm2_5: (number | null)[]; pm10: (number | null)[] };
};

export async function fetchAir(p: LatLng) {
  const [lat, lng] = cellKey(p.lat, p.lng, 0.05).split(',').map(Number);
  try {
    const r = await cached(`air:${lat},${lng}`, TTL.air, () =>
      fetchJSON<Raw>(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm2_5,pm10&hourly=pm2_5,pm10&forecast_days=5&timezone=auto`,
      ),
    );
    return { data: r.value, live: r.fresh, at: r.at };
  } catch (e) {
    const snap = snapshot<{ data: Raw; live: boolean; at: number }>('raw.air', p);
    if (snap) return { ...snap, live: false };
    throw e;
  }
}

export async function getAir(p: LatLng): Promise<Air> {
  const r = await fetchAir(p);
  const j = r.data;
  const pm25 = j.current.pm2_5 ?? j.hourly.pm2_5.find((x) => x != null) ?? 0;
  const pm10 = j.current.pm10 ?? null;
  const a25 = aqiPm25(pm25);
  const a10 = pm10 != null ? aqiPm10(pm10) : 0;
  const aqi = Math.max(a25, a10);
  const byDay = new Map<string, { p25: number[]; p10: number[] }>();
  j.hourly.time.forEach((t, i) => {
    const d = t.slice(0, 10);
    const e = byDay.get(d) ?? { p25: [], p10: [] };
    const v25 = j.hourly.pm2_5[i];
    const v10 = j.hourly.pm10[i];
    if (v25 != null) e.p25.push(v25);
    if (v10 != null) e.p10.push(v10);
    byDay.set(d, e);
  });
  const forecast = [...byDay.entries()]
    .filter(([, e]) => e.p25.length >= 12)
    .slice(0, 5)
    .map(([date, e]) => {
      const m25 = round(mean(e.p25), 1);
      const dAqi = Math.max(aqiPm25(m25), e.p10.length ? aqiPm10(mean(e.p10)) : 0);
      return { date, pm25: m25, aqi: dAqi, category: aqiCategory(dAqi) };
    });
  const category = aqiCategory(aqi);
  return {
    pm25: round(pm25, 1),
    aqi,
    category,
    dominant: a10 > a25 ? 'pm10' : 'pm25',
    forecast,
    stations: [],
    my_sensors: [],
    advice: airAdvice(category),
    meta: makeMeta(r.live, [src(SRC.airQuality, j.current.time)]),
  };
}
