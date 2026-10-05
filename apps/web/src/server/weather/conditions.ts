import 'server-only';

import type { BmdLevel, Conditions, ForecastDay, LatLng, Locale, Source, Warning } from '@/lib/data/types';

import { placeLabel } from '../geo/geo';
import { dayLabel } from '../i18n';
import { makeMeta, SRC, src } from '../meta';
import { round } from '../util';
import { getArchive, normalFor } from './archive';
import { BMD_ORDER, bmdLevel, inBangladesh } from './bmd';
import { type Forecast, getForecast, localDate, noonRh } from './forecast';
import { heatIndex, heatRisk } from './heat-index';

/** Daily feels-like maximum: heat index of tmax with the ~13:00 humidity. */
export function feelsMax(fc: Forecast, date: string, tmax: number): number {
  return heatIndex(tmax, noonRh(fc, date));
}

export function forecastDays(fc: Forecast, bd: boolean, days = 5, today = localDate(fc)): ForecastDay[] {
  return fc.daily
    .filter((d) => d.date >= today)
    .slice(0, days)
    .map((d) => {
      const feels = feelsMax(fc, d.date, d.tmax);
      return {
        date: d.date,
        tmax_c: round(d.tmax, 1),
        tmin_c: round(d.tmin, 1),
        feels_max_c: round(feels, 1),
        rain_mm: round(d.rain, 1),
        bmd_level: bd ? bmdLevel(d.tmax) : null,
        heat_risk: heatRisk(feels),
      };
    });
}

/**
 * Warnings computed by us (source 'local'): in Bangladesh from BMD heat-wave bands over the next
 * 3 days; elsewhere from the NOAA heat-index danger bands.
 */
export function heatWarnings(days: ForecastDay[], bd: boolean, lang: Locale): Warning[] {
  const next = days.slice(0, 3);
  if (bd) {
    const hits = next.filter((d) => d.bmd_level);
    if (!hits.length) return [];
    const top = hits.reduce((a, b) => (BMD_ORDER[b.bmd_level as BmdLevel] > BMD_ORDER[a.bmd_level as BmdLevel] ? b : a));
    const level = top.bmd_level as BmdLevel;
    const until = hits[hits.length - 1].date;
    return [
      {
        source: 'local',
        level,
        text: { code: `warning.heatwave_${level}`, params: { tmax: Math.round(top.tmax_c), day: dayLabel(top.date, lang), until: dayLabel(until, lang) } },
        until,
      },
    ];
  }
  const hot = next.filter((d) => d.heat_risk === 'danger' || d.heat_risk === 'xdanger');
  if (!hot.length) return [];
  const top = hot.reduce((a, b) => (b.feels_max_c > a.feels_max_c ? b : a));
  const extreme = top.heat_risk === 'xdanger';
  return [
    {
      source: 'local',
      level: extreme ? 'danger' : 'warning',
      text: { code: extreme ? 'warning.heat_extreme' : 'warning.heat_danger', params: { feels: Math.round(top.feels_max_c), day: dayLabel(top.date, lang) } },
      until: hot[hot.length - 1].date,
    },
  ];
}

export async function getConditions(p: LatLng, lang: Locale): Promise<Conditions> {
  const bd = inBangladesh(p);
  const [fcR, arR, place] = await Promise.all([
    getForecast(p),
    getArchive(p).catch(() => null),
    placeLabel(p, lang),
  ]);
  const fc = fcR.data;
  const today = localDate(fc);
  const air = round(fc.current.temp, 1);
  const rh = Math.round(fc.current.rh);
  const feels = round(heatIndex(fc.current.temp, fc.current.rh), 1);
  const days = forecastDays(fc, bd, 5, today);
  const tmaxToday = days[0]?.tmax_c ?? air;
  const normal = arR ? normalFor(arR.data, today) : null;
  const sources: Source[] = [src(SRC.openMeteo, fcR.at)];
  if (arR) sources.push(src(SRC.archive, arR.data.end));
  const bmdToday = bd ? bmdLevel(tmaxToday) : null;
  // The "BMD thresholds" chip only when a BMD heat-wave level actually applies today.
  if (bmdToday) sources.push(SRC.bmd);
  return {
    place,
    time: fc.current.time,
    air_c: air,
    feels_c: feels,
    humidity: rh,
    wind_kmh: round(fc.current.wind, 1),
    heat_risk: heatRisk(feels),
    bmd_level: bmdToday,
    normal_c: normal,
    anomaly_c: normal != null ? round(tmaxToday - normal, 1) : null,
    forecast: days,
    warnings: heatWarnings(days, bd, lang),
    meta: makeMeta(fcR.live && (arR?.live ?? true), sources),
  };
}
