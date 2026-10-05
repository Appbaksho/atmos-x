import 'server-only';

import type { Locale } from '@/lib/data/types';

import { cached, TTL } from '../cache';
import { text } from '../openai';
import { EXPLAIN_PROMPT } from './prompts';

export type ExplainInput = {
  zone_name: string;
  heat_score: number;
  est_surface_c: number;
  scan_median_est_c: number;
  air_c: number;
  sealed_pct: number;
  road_pct: number;
  green_pct: number;
  water_pct: number;
  buildings_per_ha: number;
  dark_roofs_pct_assumed: number | null;
  top_causes: { cause: string; adds_c: number }[];
  what_if_green: { add_green_pct: number; lst_drop_c: number; score_after: number };
  night: boolean;
};

/** "Why is this zone hot?" in the user's language, cached per zone + language for 7 days. */
export async function explainZone(zoneId: string, lang: Locale, input: ExplainInput): Promise<string | null> {
  try {
    const r = await cached(
      `explain:${lang === 'en' ? 'v2' : 'v3'}:${zoneId}:${lang}`,
      TTL.ai,
      () => text({ instructions: EXPLAIN_PROMPT(lang), input: JSON.stringify(input), label: 'explain', maxOutputTokens: 900 }),
      { staleOnError: true },
    );
    return r.value;
  } catch {
    return null;
  }
}
