import 'server-only';

import { z } from 'zod';

import type { LatLng, Locale, Meta, Species, SpeciesSummary } from '@/lib/data/types';

import { cached } from '../cache';
import { SPECIES_PROMPT } from '../ai/prompts';
import { countryOf } from '../geo/geo';
import { makeMeta, SRC } from '../meta';
import { structured } from '../openai';
import { inBangladesh } from '../weather/bmd';
import { CARE, type Cat, coolOf, DETAIL, img, midPrice, NEEM_IMG, POLLEN, SEASON, TREES, type TreeRow } from './species-data';

/** Species: the curated Bangladesh list, or an AI-generated native shortlist elsewhere (cached per country + climate band). */

const EMOJI: Record<Cat, string> = { s: '🌳', f: '🌸', r: '🥭', n: '🌲' };
const l3 = (lang: Locale): 'en' | 'bn' | 'ur' => (lang === 'bn' || lang === 'ur' ? lang : 'en');

const coolingOf = (canopy: number): SpeciesSummary['cooling'] => (canopy >= 12 ? 'high' : canopy >= 8 ? 'medium' : 'low');

function rowSummary(r: TreeRow, lang: Locale): SpeciesSummary {
  const d = DETAIL[r[0]];
  const name = lang === 'bn' ? r[2] : lang === 'ur' ? r[3] : r[1];
  const price = d ? d.price : [r[7], r[8]];
  return {
    id: r[0],
    name,
    local_name: lang === 'bn' ? r[1] : r[2],
    scientific: r[4],
    emoji: EMOJI[r[5]],
    canopy_m: r[6],
    cooling: coolingOf(r[6]),
    water: d?.water ?? (r[5] === 'r' ? 'medium' : 'low'),
    price: { amount: midPrice(price[0], price[1]), currency: 'BDT' },
    image_url: d?.img ?? img(NEEM_IMG, 600, 500, '&crop=focalpoint&fp-x=.5&fp-y=.5&fp-z=1.4'),
  };
}

const MADHABILATA = (lang: Locale): SpeciesSummary => {
  const d = DETAIL.madhabilata;
  return {
    id: 'madhabilata',
    name: d.names[l3(lang)],
    local_name: lang === 'bn' ? d.names.en : d.names.bn,
    scientific: d.sci,
    emoji: '🌿',
    canopy_m: d.canopy,
    cooling: 'low',
    water: d.water,
    price: { amount: midPrice(d.price[0], d.price[1]), currency: 'BDT' },
    image_url: d.img,
  };
};

export function curatedList(lang: Locale): SpeciesSummary[] {
  return [...TREES.map((r) => rowSummary(r, lang)), MADHABILATA(lang)];
}

export function curatedDetail(id: string, lang: Locale): Species | null {
  const L = l3(lang);
  if (id === 'madhabilata') {
    const d = DETAIL.madhabilata;
    return { ...MADHABILATA(lang), planting_season: SEASON[L], growth: d.growth, notes: CARE.climber[L], native_regions: ['Bangladesh', 'South Asia'] };
  }
  const r = TREES.find((x) => x[0] === id);
  if (!r) return null;
  const d = DETAIL[id];
  const care = d?.care === 'krish' ? CARE.krish[L] : CARE.tree[L];
  const pollen = POLLEN[id] === 2 ? 'High pollen' : POLLEN[id] ? 'Some pollen' : 'Low pollen';
  return {
    ...rowSummary(r, lang),
    planting_season: SEASON[L],
    growth: d?.growth ?? `${r[6]} m canopy at maturity · ${pollen}`,
    notes: care,
    native_regions: ['Bangladesh', 'South Asia'],
    estimate: r[9] === 0,
  };
}

/** Prototype cooling per tree at maturity (within ~25 m), for species cards. */
export const speciesCoolingC = (canopyM: number) => coolOf(canopyM);

const AiSpecies = z.object({
  species: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        local_name: z.string().nullable(),
        scientific: z.string(),
        emoji: z.string(),
        canopy_m: z.number(),
        cooling: z.enum(['high', 'medium', 'low']),
        water: z.enum(['high', 'medium', 'low']),
        planting_season: z.string(),
        growth: z.string(),
        notes: z.array(z.string()),
        native_regions: z.array(z.string()),
      }),
    )
    .max(10),
});

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);

async function aiShortlist(p: LatLng, lang: Locale): Promise<{ list: Species[]; at: number; fresh: boolean }> {
  const cc = (await countryOf(p)) ?? 'XX';
  const band = Math.round(p.lat / 5) * 5;
  const r = await cached(`species:${cc}:${band}:${lang}`, 30 * 24 * 3600_000, async () => {
    const out = await structured({
      schema: AiSpecies,
      name: 'species_shortlist',
      instructions: SPECIES_PROMPT(lang, cc === 'XX' ? null : cc),
      input: JSON.stringify({ lat: Math.round(p.lat * 10) / 10, lng: Math.round(p.lng * 10) / 10, country: cc, latitude_band: band }),
      label: 'species',
      maxOutputTokens: 4000,
    });
    return out.species.map(
      (s): Species => ({
        id: `ai-${cc.toLowerCase()}-${slug(s.id || s.scientific)}`,
        name: s.name,
        local_name: s.local_name,
        scientific: s.scientific,
        emoji: s.emoji,
        canopy_m: s.canopy_m,
        cooling: s.cooling,
        water: s.water,
        price: null,
        image_url: null,
        planting_season: s.planting_season,
        growth: s.growth,
        notes: s.notes.slice(0, 4),
        native_regions: s.native_regions,
        estimate: true,
      }),
    );
  });
  return { list: r.value, at: r.at, fresh: r.fresh };
}

export async function getSpeciesList(p: LatLng | null, lang: Locale): Promise<{ species: SpeciesSummary[]; meta: Meta }> {
  if (!p || inBangladesh(p)) return { species: curatedList(lang), meta: makeMeta(true, [SRC.curated]) };
  try {
    const r = await aiShortlist(p, lang);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const species = r.list.map(({ planting_season, growth, notes, native_regions, estimate, ...s }) => s);
    return { species, meta: makeMeta(r.fresh, [SRC.ai]) };
  } catch {
    // AI unavailable: the curated South-Asian list is better than nothing, but say so.
    return { species: curatedList(lang), meta: makeMeta(false, [SRC.curated]) };
  }
}

export async function getSpecies(id: string, p: LatLng | null, lang: Locale): Promise<Species | null> {
  const cur = curatedDetail(id, lang);
  if (cur) return { ...cur, meta: makeMeta(true, [SRC.curated]) };
  if (!id.startsWith('ai-') || !p) return null;
  try {
    const r = await aiShortlist(p, lang);
    const s = r.list.find((x) => x.id === id);
    return s ? { ...s, meta: makeMeta(r.fresh, [SRC.ai]) } : null;
  } catch {
    return null;
  }
}
