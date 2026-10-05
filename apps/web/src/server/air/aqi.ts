import 'server-only';

import type { AqiCategory, I18nText } from '@/lib/data/types';

/**
 * US EPA AQI (2024 revision of the PM2.5 breakpoints). Concentrations are truncated to the
 * breakpoint precision (PM2.5: 0.1 µg/m³, PM10: 1 µg/m³) before interpolation.
 */
type Bp = [cLo: number, cHi: number, iLo: number, iHi: number];

export const PM25_BREAKPOINTS: Bp[] = [
  [0.0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
];

export const PM10_BREAKPOINTS: Bp[] = [
  [0, 54, 0, 50],
  [55, 154, 51, 100],
  [155, 254, 101, 150],
  [255, 354, 151, 200],
  [355, 424, 201, 300],
  [425, 604, 301, 500],
];

function aqiFrom(c: number, bps: Bp[], decimals: number): number {
  const f = 10 ** decimals;
  const t = Math.floor(Math.max(0, c) * f) / f;
  const last = bps[bps.length - 1];
  if (t > last[1]) return 500;
  const bp = bps.find(([lo, hi]) => t >= lo && t <= hi) ?? bps.find(([, hi]) => t <= hi) ?? last;
  const [cLo, cHi, iLo, iHi] = bp;
  return Math.round(((iHi - iLo) / (cHi - cLo)) * (t - cLo) + iLo);
}

export const aqiPm25 = (c: number) => aqiFrom(c, PM25_BREAKPOINTS, 1);
export const aqiPm10 = (c: number) => aqiFrom(c, PM10_BREAKPOINTS, 0);

export function aqiCategory(aqi: number): AqiCategory {
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'usg';
  if (aqi <= 200) return 'unhealthy';
  if (aqi <= 300) return 'very_unhealthy';
  return 'hazardous';
}

/** Advice codes per category (rendered from the `server` namespace: advice.air.*). */
export function airAdvice(cat: AqiCategory): I18nText[] {
  const codes: Record<AqiCategory, string[]> = {
    good: ['advice.air.enjoy_outdoors', 'advice.air.ventilate'],
    moderate: ['advice.air.sensitive_watch', 'advice.air.ventilate_off_peak'],
    usg: ['advice.air.sensitive_reduce', 'advice.air.windows_peak', 'advice.air.mask_sensitive'],
    unhealthy: ['advice.air.reduce_outdoor', 'advice.air.mask_n95', 'advice.air.windows_closed'],
    very_unhealthy: ['advice.air.avoid_outdoor', 'advice.air.mask_n95', 'advice.air.windows_closed', 'advice.air.purifier'],
    hazardous: ['advice.air.stay_indoors', 'advice.air.mask_n95', 'advice.air.windows_closed', 'advice.air.purifier'],
  };
  return codes[cat].map((code) => ({ code }));
}
