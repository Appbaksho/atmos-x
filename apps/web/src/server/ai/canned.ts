import 'server-only';

import type { Air, AskClientState, Conditions, FarmAlertsResponse, Locale, ScreenId, ZoneDetail } from '@/lib/data/types';

import { renderText, serverT } from '../i18n';

/**
 * Canned fallback answers (ported from apps/mobile/src/components/cz/ask-atmos.tsx). When OpenAI is
 * down or the daily cap is hit, Ask streams the closest canned answer with a notice. If we do have
 * live data for the topic we fill a template with it (never invented numbers); the prototype's
 * fixed demo text is only used when nothing is available.
 */

export type Kind = 'heat' | 'air' | 'farm' | 'tree';

/** Which screen → default topic (port of screenContext). */
export function screenKind(screen: ScreenId, farmer: boolean): Kind {
  if (screen === 'S04' || screen === 'S05') return farmer ? 'farm' : 'heat';
  if (screen.startsWith('F')) return 'farm';
  if (screen === 'S26' || screen === 'S27' || screen === 'S28') return 'air';
  if (['S06', 'S07', 'S16', 'S17', 'S18', 'S19', 'S01', 'S02', 'S03'].includes(screen)) return 'heat';
  return 'tree';
}

/** Topic of a question (port of kindOf, extended to Urdu keywords). */
export function kindOf(q: string, fallback: Kind): Kind {
  if (/pm|air|smog|dust|window|mask|aqi|বাতাস|ধুলা|জানালা|মাস্ক|ہوا|دھول|کھڑکی|ماسک/i.test(q)) return 'air';
  if (/rice|crop|field|irrigat|harvest|paddy|farm|ধান|জমি|ফসল|সেচ|কাটা|চাষ|چاول|فصل|کھیت|آبپاشی/i.test(q)) return 'farm';
  if (/tree|leaf|leaves|neem|plant|sapling|nursery|agun|beguni|shanti|গাছ|পাতা|আগুন|বেগুনি|লাগা|চারা|নার্সারি|درخت|پتے|پودا|نرسری/i.test(q)) return 'tree';
  if (/hot|heat|temperature|warm|cool|গরম|তাপ|ঠান্ডা|گرم|گرمی|درجہ/i.test(q)) return 'heat';
  return fallback;
}

export type CannedData = { conditions?: Conditions | null; zone?: ZoneDetail | null; air?: Air | null; farm?: FarmAlertsResponse | null; state?: AskClientState };

export function cannedAnswer(kind: Kind, lang: Locale, d: CannedData): string {
  if (kind === 'heat') {
    const z = d.zone;
    const c = d.conditions;
    if (z && c) {
      return serverT(lang, 'ask.canned.heat_zone', {
        zone: z.name,
        sealed: z.drivers.sealed_pct,
        green: z.drivers.green_pct,
        air: Math.round(c.air_c),
        feels: Math.round(c.feels_c),
        surface: Math.round(z.lst_c),
        tmax: Math.round(Math.max(...c.forecast.map((f) => f.tmax_c))),
      });
    }
    if (c) return serverT(lang, 'ask.canned.heat_now', { air: Math.round(c.air_c), feels: Math.round(c.feels_c), tmax: Math.round(Math.max(...c.forecast.map((f) => f.tmax_c))) });
    return serverT(lang, 'ask.canned.heat');
  }
  if (kind === 'air') {
    const a = d.air;
    if (a) {
      const advice = a.advice[0] ? renderText(lang, a.advice[0]) : '';
      return serverT(lang, 'ask.canned.air_now', { pm25: Math.round(a.pm25), aqi: a.aqi, category: serverT(lang, `aqi.${a.category}`), advice });
    }
    return serverT(lang, 'ask.canned.air');
  }
  if (kind === 'farm') {
    const al = d.farm?.alerts[0];
    if (al) {
      const act = al.actions[0] ? renderText(lang, al.actions[0]) : '';
      return `${renderText(lang, al.title)}. ${renderText(lang, al.body)} ${act}`.trim();
    }
    if (d.farm) return serverT(lang, 'ask.canned.farm_none');
    return serverT(lang, 'ask.canned.farm');
  }
  const due = d.state?.trees?.find((t) => t.status === 'due' || t.status === 'overdue');
  if (due) return serverT(lang, 'ask.canned.tree_due', { name: due.nickname });
  return serverT(lang, 'ask.canned.tree');
}

/** Split text into small chunks so a canned answer still streams. */
export function chunks(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}
