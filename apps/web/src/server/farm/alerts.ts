import 'server-only';

import type { AlertLevel, CropId, FarmAlert, FarmAlertsResponse, Hazard, I18nText, LatLng, Locale, Source, StageId } from '@/lib/data/types';

import { dayLabel } from '../i18n';
import { makeMeta, SRC, src } from '../meta';
import { snapshot } from '../snapshots';
import { round } from '../util';
import { type Forecast, getForecast } from '../weather/forecast';
import { heatIndex } from '../weather/heat-index';
import { fetchPowerDaily, type PowerDaily } from './nasa-power';

/**
 * Farmer Mode alert engine for Bangladesh, ported from apps/mobile/src/lib/farmer.ts.
 * Inputs: Open-Meteo 7-day forecast, NASA POWER past-30-day rainfall (null on failure), an upstream
 * (Meghalaya) forecast for haor flash floods, crop + growth stage. Thresholds follow BMD / BRRI / DAE
 * advisories. v0 adds lightning from weather codes 95/96/99. Text is I18nText (`farm.<rule>.*`).
 */

export const CROPS: CropId[] = ['boro', 'aman', 'aus', 'potato', 'wheat', 'maize', 'jute', 'vegetables'];
export const STAGES: StageId[] = ['seedbed', 'vegetative', 'flowering', 'ripening', 'harvest'];

const isRice = (c: CropId) => c === 'boro' || c === 'aman' || c === 'aus';
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Rough regional boxes. */
export function regionOf(p: LatLng) {
  const { lat: la, lng: lo } = p;
  return {
    haor: la >= 24.0 && la <= 25.3 && lo >= 90.6 && lo <= 92.0,
    coastal: la <= 22.95 && lo >= 89.0 && lo <= 92.4,
    north: la >= 24.3 && lo <= 89.9,
  };
}

const UPSTREAM_CHERRAPUNJI: LatLng = { lat: 25.27, lng: 91.73 };

type Draft = {
  rule: string;
  hazard: Hazard;
  level: AlertLevel;
  emoji: string;
  title: I18nText;
  body: I18nText;
  actions: I18nText[];
  from: string;
  to: string;
  extraSources?: Source[];
};

const a3 = (rule: string, first = 'a1') => [{ code: `farm.${rule}.${first}` }, { code: `farm.${rule}.a2` }, { code: `farm.${rule}.a3` }];

/** Pure rules over the inputs (unit-testable). */
export function farmRules(
  fc: Forecast,
  power: PowerDaily | null,
  upstream: Forecast | null,
  p: LatLng,
  crop: CropId,
  stage: StageId,
  lang: Locale,
  month = new Date().getMonth() + 1,
): Draft[] {
  const region = regionOf(p);
  const d = fc.daily;
  const out: Draft[] = [];
  const first = d[0]?.date ?? '';
  const last = d[d.length - 1]?.date ?? first;
  const day = (date: string) => dayLabel(date, lang);

  // 1. Haor flash flood (pre-monsoon, Mar–Jun)
  if (region.haor && month >= 3 && month <= 6) {
    const local3 = Math.max(...[0, 1, 2, 3, 4].map((i) => sum(d.slice(i, i + 3).map((x) => x.rain))));
    const up3 = upstream ? Math.max(...[0, 1, 2, 3, 4].map((i) => sum(upstream.daily.slice(i, i + 3).map((x) => x.rain)))) : 0;
    if (local3 >= 100 || up3 >= 150) {
      out.push({
        rule: 'haor_flood',
        hazard: 'flood',
        level: local3 >= 150 || up3 >= 250 ? 'danger' : 'warning',
        emoji: '🌊',
        title: { code: 'farm.haor_flood.title' },
        body: { code: 'farm.haor_flood.body', params: { local_mm: Math.round(local3), up_mm: Math.round(up3) } },
        actions: a3('haor_flood'),
        from: first,
        to: d[Math.min(4, d.length - 1)]?.date ?? last,
        extraSources: [{ ...SRC.openMeteo, id: 'open-meteo-upstream', name: 'Open-Meteo (upstream Meghalaya)' }],
      });
    }
  }

  // 2. Heat stress at rice flowering (spikelet sterility above ~35 °C)
  const hotDays = d.filter((x) => x.tmax >= 35);
  if (isRice(crop) && (stage === 'flowering' || stage === 'vegetative') && hotDays.length) {
    const peak = Math.max(...hotDays.map((x) => x.tmax));
    out.push({
      rule: 'rice_heat',
      hazard: 'heat',
      level: stage === 'flowering' ? (peak >= 38 ? 'danger' : 'warning') : 'watch',
      emoji: '🔥',
      title: { code: 'farm.rice_heat.title' },
      body: { code: 'farm.rice_heat.body', params: { days: hotDays.length, peak: round(peak, 1), day: day(hotDays[0].date) } },
      actions: a3('rice_heat'),
      from: hotDays[0].date,
      to: hotDays[hotDays.length - 1].date,
    });
  }

  // 3. Drought / dry spell
  const rain30 = power ? sum(power.rain.filter((x): x is number => x != null)) : null;
  const rain7 = sum(d.map((x) => x.rain));
  const et7 = sum(d.map((x) => x.et0));
  if (rain30 != null && rain30 < 25 && rain7 < 10 && et7 > 20 && crop !== 'potato') {
    out.push({
      rule: 'drought',
      hazard: 'drought',
      level: rain30 < 10 ? 'warning' : 'watch',
      emoji: '🏜️',
      title: { code: 'farm.drought.title' },
      body: { code: 'farm.drought.body', params: { rain30: Math.round(rain30), rain7: Math.round(rain7), et7: Math.round(et7) } },
      actions: a3('drought'),
      from: first,
      to: last,
      extraSources: [SRC.nasaPower],
    });
  }

  // 4. Cyclone / storm during harvest
  const stormDays = d.filter((x) => x.gust >= 62 || x.wind >= 45);
  if (stormDays.length) {
    const peak = Math.max(...stormDays.map((x) => x.gust));
    const harvestTime = stage === 'ripening' || stage === 'harvest';
    out.push({
      rule: 'storm',
      hazard: 'storm',
      level: peak >= 89 || (region.coastal && harvestTime) ? 'danger' : 'warning',
      emoji: '🌀',
      title: { code: region.coastal ? 'farm.storm.title_coastal' : 'farm.storm.title' },
      body: { code: 'farm.storm.body', params: { gust: Math.round(peak), day: day(stormDays[0].date) } },
      actions: [{ code: harvestTime ? 'farm.storm.a1_harvest' : 'farm.storm.a1_stake' }, { code: 'farm.storm.a2' }, { code: 'farm.storm.a3' }],
      from: stormDays[0].date,
      to: stormDays[stormDays.length - 1].date,
    });
  }

  // 5. Cold wave (BMD: mild 8–10 °C, moderate 6–8 °C, severe < 6 °C)
  const coldDays = d.filter((x) => x.tmin <= 10);
  if (coldDays.length) {
    const low = Math.min(...coldDays.map((x) => x.tmin));
    const sev = low < 6 ? 'severe' : low < 8 ? 'moderate' : 'mild';
    out.push({
      rule: 'cold',
      hazard: 'cold',
      level: low < 6 ? 'danger' : low < 8 ? 'warning' : 'watch',
      emoji: '🥶',
      title: { code: `farm.cold.title_${sev}` },
      body: { code: 'farm.cold.body', params: { low: round(low, 1), day: day(coldDays[0].date) } },
      actions: a3('cold'),
      from: coldDays[0].date,
      to: coldDays[coldDays.length - 1].date,
    });
  }

  // 6. Potato late blight (RH ≥ 90 %, 10–25 °C for ≥ 10 h/day, 2 consecutive days)
  if (crop === 'potato' || crop === 'vegetables') {
    const byDay = new Map<string, number>();
    for (const h of fc.hourly) {
      if (h.rh >= 90 && h.temp >= 10 && h.temp <= 25) {
        const k = h.time.slice(0, 10);
        byDay.set(k, (byDay.get(k) ?? 0) + 1);
      }
    }
    const days = [...byDay.entries()]
      .filter(([, n]) => n >= 10)
      .map(([k]) => k)
      .sort();
    let consecutive = false;
    for (let i = 1; i < days.length; i++) if ((Date.parse(days[i]) - Date.parse(days[i - 1])) / 86_400_000 === 1) consecutive = true;
    if (consecutive) {
      out.push({
        rule: 'late_blight',
        hazard: 'disease',
        level: 'warning',
        emoji: '🍂',
        title: { code: 'farm.late_blight.title' },
        body: { code: 'farm.late_blight.body', params: { days: days.length } },
        actions: a3('late_blight'),
        from: days[0],
        to: days[days.length - 1],
      });
    }
  }

  // 7. Monsoon onset (May–Jul): three wet days in a row
  if (month >= 5 && month <= 7) {
    let run = 0;
    let onset: string | null = null;
    for (const x of d) {
      run = x.rain >= 10 ? run + 1 : 0;
      if (run >= 3 && !onset) onset = x.date;
    }
    if (onset) {
      out.push({
        rule: 'monsoon',
        hazard: 'rain',
        level: 'info',
        emoji: '🌧️',
        title: { code: 'farm.monsoon.title' },
        body: { code: 'farm.monsoon.body', params: { day: day(onset) } },
        actions: a3('monsoon'),
        from: onset,
        to: last,
      });
    }
  }

  // 8. Lightning: high CAPE + likely rain in the next 72 h, or thunderstorm weather codes (95/96/99) in the next 3 days
  const stormyHours = fc.hourly.slice(0, 72).filter((h) => h.cape >= 2000 && h.precipProb >= 50);
  const thunderDays = d.slice(0, 3).filter((x) => x.code === 95 || x.code === 96 || x.code === 99);
  if (stormyHours.length || thunderDays.length) {
    const capeDanger = stormyHours.some((h) => h.cape >= 3000 && h.precipProb >= 70);
    const firstDate = stormyHours.length ? stormyHours[0].time.slice(0, 10) : thunderDays[0].date;
    const lastDate = thunderDays.length ? thunderDays[thunderDays.length - 1].date : stormyHours[stormyHours.length - 1].time.slice(0, 10);
    out.push({
      rule: 'lightning',
      hazard: 'lightning',
      level: capeDanger || thunderDays.some((x) => x.code === 99) ? 'danger' : 'warning',
      emoji: '⚡',
      title: { code: 'farm.lightning.title' },
      body: stormyHours.length
        ? { code: 'farm.lightning.body', params: { cape: Math.round(Math.max(...stormyHours.map((h) => h.cape))), day: day(firstDate), time: stormyHours[0].time.slice(11, 16) } }
        : { code: 'farm.lightning.body_codes', params: { day: day(firstDate) } },
      actions: a3('lightning'),
      from: firstDate,
      to: lastDate < firstDate ? firstDate : lastDate,
    });
  }

  // 9. Extreme heat for field workers
  const hiDays = d
    .map((x) => {
      const noonRh = fc.hourly.find((h) => h.time.startsWith(x.date) && h.time.endsWith('13:00'))?.rh ?? 60;
      return { ...x, hi: heatIndex(x.tmax, noonRh) };
    })
    .filter((x) => x.hi >= 41);
  if (hiDays.length) {
    const peak = Math.max(...hiDays.map((x) => x.hi));
    out.push({
      rule: 'worker_heat',
      hazard: 'heat',
      level: peak >= 54 ? 'danger' : 'warning',
      emoji: '🥵',
      title: { code: 'farm.worker_heat.title' },
      body: { code: 'farm.worker_heat.body', params: { peak: Math.round(peak), day: day(hiDays[0].date) } },
      actions: a3('worker_heat'),
      from: hiDays[0].date,
      to: hiDays[hiDays.length - 1].date,
    });
  }

  const order: Record<AlertLevel, number> = { danger: 0, warning: 1, watch: 2, info: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export async function getFarmAlerts(p: LatLng, crop: CropId, stage: StageId, lang: Locale): Promise<FarmAlertsResponse> {
  const region = regionOf(p);
  const [fc, power, upstream] = await Promise.all([
    getForecast(p),
    fetchPowerDaily(p, 30),
    region.haor ? getForecast(UPSTREAM_CHERRAPUNJI).catch(() => null) : Promise.resolve(null),
  ]);
  const drafts = farmRules(fc.data, power, upstream?.data ?? null, p, crop, stage, lang);
  const base = src(SRC.openMeteo, fc.at);
  const alerts: FarmAlert[] = drafts.map((x) => ({
    id: `${x.rule}-${x.from}`,
    hazard: x.hazard,
    level: x.level,
    emoji: x.emoji,
    title: x.title,
    body: x.body,
    actions: x.actions,
    window: { from: x.from, to: x.to },
    sources: [base, ...(x.extraSources ?? [])],
  }));
  const sources: Source[] = [base];
  if (power) sources.push(SRC.nasaPower);
  return {
    alerts,
    region: region.haor ? 'haor' : region.coastal ? 'coastal' : region.north ? 'north' : null,
    meta: makeMeta(fc.live, sources),
  };
}

/** Endpoint helper with snapshot fallback (forecast already falls back to the raw snapshot). */
export async function farmAlertsOrSnapshot(p: LatLng, crop: CropId, stage: StageId, lang: Locale): Promise<FarmAlertsResponse> {
  try {
    return await getFarmAlerts(p, crop, stage, lang);
  } catch (e) {
    const snap = snapshot<FarmAlertsResponse>(`farm.${crop}.${stage}.${lang}`, p);
    if (snap) return { ...snap, meta: { ...snap.meta, live: false } };
    throw e;
  }
}
