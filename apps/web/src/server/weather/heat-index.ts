import 'server-only';

import type { HeatRisk } from '@/lib/data/types';

/** Steadman / NOAA heat index (°C) from air temperature (°C) and relative humidity (%). Port of apps/mobile/src/lib/weather.ts. */
export function heatIndex(tC: number, rh: number): number {
  const t = (tC * 9) / 5 + 32;
  if (t < 80) return tC;
  const hi =
    -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t -
    0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh -
    0.00000199 * t * t * rh * rh;
  return Math.round((((hi - 32) * 5) / 9) * 10) / 10;
}

/** NOAA heat-index risk band for a feels-like temperature (°C). Port of apps/mobile/src/lib/cz/live.ts. */
export function heatRisk(feelsC: number): HeatRisk {
  if (feelsC >= 54) return 'xdanger';
  if (feelsC >= 41) return 'danger';
  if (feelsC >= 32) return 'xcaution';
  if (feelsC >= 27) return 'caution';
  return 'ok';
}

export function weatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  return '⛈️';
}
