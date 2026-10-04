import 'server-only';

import type { HistoryPoint, LatLng } from '@/lib/data/types';

import { cached, TTL } from '../cache';
import { env } from '../env';
import { fetchJSON } from '../http';
import { snapshot } from '../snapshots';
import { cellKey, mean, round } from '../util';
import type { Sourced } from './forecast';

/**
 * Open-Meteo archive (ERA5 reanalysis): daily tmax/tmin for the last 20 full years, one request per
 * 0.1° cell cached for 30 days. From it: the normal for a date (day-of-year ±7), the yearly
 * hot-season history (hottest 3 consecutive months) and a linear trend.
 */

export type ArchiveRaw = { start: string; end: string; dates: string[]; tmax: (number | null)[]; tmin: (number | null)[] };

export type ArchiveSummary = {
  years: [number, number];
  /** 1-based months of the hot season, e.g. [4, 5, 6] */
  hot_months: number[];
  history: HistoryPoint[];
  /** °C per decade of hot-season mean tmax */
  trend_c_per_decade: number;
  /** Value of the trend line in the current year (°C, hot-season mean tmax) */
  trend_now_c: number;
};

export const ARCHIVE_YEARS = 20;

export async function getArchive(p: LatLng): Promise<Sourced<ArchiveRaw>> {
  const [lat, lng] = cellKey(p.lat, p.lng, 0.1).split(',').map(Number);
  const lastYear = new Date().getUTCFullYear() - 1;
  const start = `${lastYear - ARCHIVE_YEARS + 1}-01-01`;
  const end = `${lastYear}-12-31`;
  try {
    const r = await cached(`archive:${lat},${lng}:${start}`, TTL.archive, async () => {
      const url =
        `${env.upstream.archive}?latitude=${lat}&longitude=${lng}` +
        `&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
      const j = await fetchJSON<{ daily: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[] } }>(url, {
        timeoutMs: 15_000,
      });
      return { start, end, dates: j.daily.time, tmax: j.daily.temperature_2m_max, tmin: j.daily.temperature_2m_min };
    });
    return { data: r.value, live: r.fresh, at: r.at };
  } catch (e) {
    const snap = snapshot<Sourced<ArchiveRaw>>('raw.archive', p);
    if (snap) return { ...snap, live: false };
    throw e;
  }
}

function doy(date: string): number {
  const d = new Date(date + 'T00:00:00Z');
  const s = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - s) / 86_400_000) + 1;
}

/** Mean tmax for the day-of-year of `date` ±7 days across the archive. */
export function normalFor(raw: ArchiveRaw, date: string): number | null {
  const target = doy(date);
  const vals: number[] = [];
  raw.dates.forEach((d, i) => {
    const v = raw.tmax[i];
    if (v == null) return;
    let diff = Math.abs(doy(d) - target);
    diff = Math.min(diff, 365 - diff);
    if (diff <= 7) vals.push(v);
  });
  return vals.length ? round(mean(vals), 1) : null;
}

/** Least-squares slope and intercept. */
export function linearFit(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

export function summarize(raw: ArchiveRaw, nowYear = new Date().getUTCFullYear()): ArchiveSummary {
  // Monthly climatology of tmax → hottest 3 consecutive months (wrapping).
  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  raw.dates.forEach((d, i) => {
    const v = raw.tmax[i];
    if (v != null) byMonth[Number(d.slice(5, 7)) - 1].push(v);
  });
  const mm = byMonth.map((xs) => mean(xs));
  let best = 0;
  let bestVal = -Infinity;
  for (let m = 0; m < 12; m++) {
    const v = mm[m] + mm[(m + 1) % 12] + mm[(m + 2) % 12];
    if (v > bestVal) {
      bestVal = v;
      best = m;
    }
  }
  const hot = [best, (best + 1) % 12, (best + 2) % 12];
  const perYear = new Map<number, { day: number[]; night: number[] }>();
  raw.dates.forEach((d, i) => {
    if (!hot.includes(Number(d.slice(5, 7)) - 1)) return;
    const y = Number(d.slice(0, 4));
    const e = perYear.get(y) ?? { day: [], night: [] };
    const tx = raw.tmax[i];
    const tn = raw.tmin[i];
    if (tx != null) e.day.push(tx);
    if (tn != null) e.night.push(tn);
    perYear.set(y, e);
  });
  const history: HistoryPoint[] = [...perYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, e]) => ({
      year,
      day_lst_c: e.day.length ? round(mean(e.day), 1) : null,
      night_lst_c: e.night.length ? round(mean(e.night), 1) : null,
    }));
  const pts = history.filter((h) => h.day_lst_c != null);
  const fit = linearFit(
    pts.map((h) => h.year),
    pts.map((h) => h.day_lst_c as number),
  );
  const years = history.map((h) => h.year);
  return {
    years: [Math.min(...years), Math.max(...years)],
    hot_months: hot.map((m) => m + 1),
    history,
    trend_c_per_decade: round(fit.slope * 10, 2),
    trend_now_c: round(fit.intercept + fit.slope * nowYear, 2),
  };
}
