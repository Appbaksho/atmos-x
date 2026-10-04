import 'server-only';

import type { LatLng } from '@/lib/data/types';

import { cached, TTL } from '../cache';
import { env } from '../env';
import { fetchJSON } from '../http';
import { snapshot } from '../snapshots';
import { cellKey, round } from '../util';

/** Open-Meteo forecast (free, keyless). Port of apps/mobile/src/lib/weather.ts, plus `current` and the UTC offset. */

export type DailyForecast = {
  date: string;
  tmax: number;
  tmin: number;
  rain: number;
  rainProb: number;
  gust: number;
  wind: number;
  et0: number;
  code: number;
};

export type HourlyForecast = { time: string; temp: number; rh: number; cape: number; precipProb: number };

export type CurrentWeather = { time: string; temp: number; rh: number; wind: number; code: number; isDay: boolean };

export type Forecast = {
  timezone: string;
  utcOffsetSec: number;
  current: CurrentWeather;
  daily: DailyForecast[];
  hourly: HourlyForecast[];
};

export type Sourced<T> = { data: T; live: boolean; at: number };

type Num = number | null;
type OmForecast = {
  timezone: string;
  utc_offset_seconds: number;
  current: { time: string; temperature_2m: Num; relative_humidity_2m: Num; wind_speed_10m: Num; weather_code: Num; is_day: Num };
  daily: {
    time: string[];
    temperature_2m_max: Num[];
    temperature_2m_min: Num[];
    precipitation_sum: Num[];
    precipitation_probability_max: Num[];
    wind_gusts_10m_max: Num[];
    wind_speed_10m_max: Num[];
    et0_fao_evapotranspiration: Num[];
    weather_code: Num[];
  };
  hourly: { time: string[]; temperature_2m: Num[]; relative_humidity_2m: Num[]; cape: Num[]; precipitation_probability: Num[] };
};

export function parseForecast(j: OmForecast): Forecast {
  const d = j.daily;
  const h = j.hourly;
  return {
    timezone: j.timezone,
    utcOffsetSec: j.utc_offset_seconds ?? 0,
    current: {
      time: j.current.time,
      temp: j.current.temperature_2m ?? 0,
      rh: j.current.relative_humidity_2m ?? 0,
      wind: j.current.wind_speed_10m ?? 0,
      code: j.current.weather_code ?? 0,
      isDay: (j.current.is_day ?? 1) === 1,
    },
    daily: d.time.map((t, i) => ({
      date: t,
      tmax: d.temperature_2m_max[i] ?? 0,
      tmin: d.temperature_2m_min[i] ?? 0,
      rain: d.precipitation_sum[i] ?? 0,
      rainProb: d.precipitation_probability_max[i] ?? 0,
      gust: d.wind_gusts_10m_max[i] ?? 0,
      wind: d.wind_speed_10m_max[i] ?? 0,
      et0: d.et0_fao_evapotranspiration[i] ?? 0,
      code: d.weather_code[i] ?? 0,
    })),
    hourly: h.time.map((t, i) => ({
      time: t,
      temp: h.temperature_2m[i] ?? 0,
      rh: h.relative_humidity_2m[i] ?? 0,
      cape: h.cape[i] ?? 0,
      precipProb: h.precipitation_probability[i] ?? 0,
    })),
  };
}

export function forecastUrl(lat: number, lng: number): string {
  return (
    `${env.upstream.forecast}?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,is_day` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,wind_speed_10m_max,et0_fao_evapotranspiration,weather_code` +
    `&hourly=temperature_2m,relative_humidity_2m,cape,precipitation_probability` +
    `&forecast_days=7&timezone=auto`
  );
}

/** 7-day forecast for the ~1 km cell around `p`. Falls back to the stale cache, then the Dhaka snapshot. */
export async function getForecast(p: LatLng): Promise<Sourced<Forecast>> {
  const [lat, lng] = cellKey(p.lat, p.lng, 0.01).split(',').map(Number);
  try {
    const r = await cached(`fc:${lat},${lng}`, TTL.weather, async () => parseForecast(await fetchJSON<OmForecast>(forecastUrl(lat, lng))));
    return { data: r.value, live: r.fresh, at: r.at };
  } catch (e) {
    const snap = snapshot<Sourced<Forecast>>('raw.forecast', p);
    if (snap) return { ...snap, live: false };
    throw e;
  }
}

/** Local hour (0–23) at the forecast location right now. */
export function localHour(fc: Forecast, now = Date.now()): number {
  return new Date(now + fc.utcOffsetSec * 1000).getUTCHours();
}

/** Today's date (YYYY-MM-DD) at the forecast location. */
export function localDate(fc: Forecast, now = Date.now()): string {
  return new Date(now + fc.utcOffsetSec * 1000).toISOString().slice(0, 10);
}

/** RH at ~13:00 local on `date` (used for the daily feels-like maximum). */
export function noonRh(fc: Forecast, date: string, fallback = 60): number {
  return fc.hourly.find((h) => h.time.startsWith(date) && h.time.endsWith('13:00'))?.rh ?? fallback;
}

/** The hourly reading closest to now (current block preferred). */
export function currentReading(fc: Forecast): { temp: number; rh: number; time: string } {
  return { temp: round(fc.current.temp, 1), rh: Math.round(fc.current.rh), time: fc.current.time };
}
