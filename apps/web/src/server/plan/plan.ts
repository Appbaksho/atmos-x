import 'server-only';

import { cellArea } from 'h3-js';
import { z } from 'zod';

import type { Budget, BudgetLine, Locale, Money, Plan, PlanAction, PlanRequest, PlanStep, Source, SpeciesSummary } from '@/lib/data/types';

import { PLAN_PROMPT } from '../ai/prompts';
import { countryOf } from '../geo/geo';
import { scanForZone } from '../heat/scan';
import { makeMeta, SRC } from '../meta';
import { structured } from '../openai';
import { round } from '../util';
import { inBangladesh } from '../weather/bmd';
import { roofCoolingC, shadeCoolingC, treeCoolingC } from './coeffs';
import { feasibility } from './feasibility';
import { curatedList } from './species';
import { getPlantingSpots } from './spots';

/** Reference unit costs (deterministic fallback; AI may refine them, marked estimate). */
const REF_COSTS: Record<string, { currency: string; tree: number; roof_m2: number; shade: number; care_tree_year: number }> = {
  BD: { currency: 'BDT', tree: 450, roof_m2: 90, shade: 18000, care_tree_year: 300 },
  default: { currency: 'USD', tree: 25, roof_m2: 6, shade: 600, care_tree_year: 10 },
};
const WATER_L_WEEK_PER_TREE = 20;

const AiPlan = z.object({
  species_ids: z.array(z.string()).max(6),
  extra_species: z
    .array(z.object({ name: z.string(), scientific: z.string(), canopy_m: z.number(), water: z.enum(['high', 'medium', 'low']) }))
    .max(5),
  unit_costs: z.object({ currency: z.string(), tree: z.number(), roof_m2: z.number(), shade: z.number(), care_tree_year: z.number() }),
  water_l_week_per_tree: z.number(),
  steps: z.array(z.object({ title: z.string(), detail: z.string() })).max(6),
  care_plan: z.string(),
  next_task: z.string(),
});
type AiPlan = z.infer<typeof AiPlan>;

/** Deterministic fallback steps (port of planForZone's steps) in en / bn / ur. */
function fallbackSteps(lang: Locale, trees: number, roof: number): PlanStep[] {
  const n = (x: number) => new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : lang === 'ur' ? 'ur-PK' : 'en-GB').format(x);
  if (lang === 'bn')
    return [
      { title: 'খালি জায়গা চিহ্নিত করুন', detail: 'জোনটি হেঁটে রাস্তার ধার, স্কুলের মাঠ, মসজিদ-মন্দিরের আঙিনা ও ছায়াহীন খালি প্লট লিখে রাখুন।' },
      { title: `প্রায় ${n(trees)}টি ছায়াগাছ লাগান`, detail: 'দেশি, চওড়া ছাউনির প্রজাতি বেছে নিন। বর্ষার শুরুতে লাগালে চারা বেশি বাঁচে।' },
      { title: `প্রায় ${n(roof)} m² ছাদ সাদা করুন`, detail: 'টিন ও কংক্রিটের ছাদে চুনকাম বা প্রতিফলক রং। গ্রীষ্মের আগেই দ্রুত ফল।' },
      { title: 'দল গড়ুন', detail: 'প্রতিবেশী, স্কুল বা অফিসকে ডাকুন। প্রতিটি লগ করা কাজ যৌথ লক্ষ্যে যোগ হয়।' },
      { title: '২ বছর যত্ন নিন', detail: 'শুকনো মৌসুমে প্রতি সপ্তাহে চারায় পানি দিন এবং যত্ন লগ করুন।' },
    ];
  if (lang === 'ur')
    return [
      { title: 'خالی جگہوں کا نقشہ بنائیں', detail: 'زون میں چل کر سڑک کنارے، اسکول کے میدان، مسجد و مندر کے احاطے اور بے سایہ خالی پلاٹ نوٹ کریں۔' },
      { title: `تقریباً ${n(trees)} سایہ دار درخت لگائیں`, detail: 'مقامی، چوڑی چھتری والے درخت چنیں۔ برسات کے آغاز میں لگانے سے پودے زیادہ بچتے ہیں۔' },
      { title: `تقریباً ${n(roof)} m² چھتیں سفید کریں`, detail: 'ٹین اور کنکریٹ کی چھتوں پر چونا یا منعکس کرنے والا رنگ۔ گرمی سے پہلے فوری فائدہ۔' },
      { title: 'ٹیم بنائیں', detail: 'پڑوسیوں، اسکول یا دفتر کو بلائیں۔ ہر درج کیا گیا کام مشترکہ ہدف میں شامل ہوتا ہے۔' },
      { title: '۲ سال دیکھ بھال کریں', detail: 'خشک موسم میں ہر ہفتے پودوں کو پانی دیں اور دیکھ بھال درج کریں۔' },
    ];
  return [
    { title: 'Map the bare spots', detail: 'Walk the zone and note roadsides, school yards, mosque and temple grounds, and vacant plots without shade.' },
    { title: `Plant ~${n(trees)} shade trees`, detail: 'Prioritise native, broad-canopy species. Plant at the start of the monsoon for best survival.' },
    { title: `Coat ~${n(roof)} m² of roofs white`, detail: 'Lime wash or reflective paint on tin and concrete roofs. Quick win before summer peaks.' },
    { title: 'Recruit a team', detail: 'Invite neighbours, your school or office. Every logged action counts toward the shared goal.' },
    { title: 'Care for 2 years', detail: 'Water saplings weekly in the dry season and log care sessions so survival stays high.' },
  ];
}

const money = (amount: number, currency: string): Money => ({ amount: Math.round(amount), currency });

function monthsUntil(date: string): number {
  const t = Date.parse(date);
  return Number.isFinite(t) ? (t - Date.now()) / (30.44 * 24 * 3600_000) : 12;
}

export async function buildPlan(req: PlanRequest): Promise<Plan> {
  const { goal, lang } = req;
  const sources: Source[] = [SRC.model];
  let live = true;

  // Zone cells: from the request, else from the (cached) scan.
  let cells = req.zone?.h3 ?? [];
  let drivers = req.zone?.drivers ?? null;
  if (!cells.length) {
    const found = await scanForZone(goal.zone_id).catch(() => null);
    if (found) {
      cells = found.zone.h3;
      drivers ??= { sealed_pct: Math.round((found.zone.cover.built + found.zone.cover.road) * 100), green_pct: Math.round(found.zone.cover.green * 100), ndvi: null, dark_roof_pct: null, pop_density_km2: round(found.zone.cover.density, 1), night_lst_c: null };
    }
  }
  const areaKm2 = cells.length ? cells.reduce((a, c) => a + cellArea(c, 'km2'), 0) : 0.15;

  const country = inBangladesh(goal.zone_centroid) ? 'BD' : await countryOf(goal.zone_centroid);
  let space: { ground_m2: number; roof_m2: number; roadside_m: number } | null = null;
  if (cells.length) {
    try {
      const spots = await getPlantingSpots(goal.zone_id, cells);
      space = spots.totals;
      sources.push(...spots.meta.sources.filter((s) => s.id === 'osm'));
      live &&= spots.meta.live;
    } catch {
      live = false;
    }
  }
  const feas = feasibility(goal.target_c, areaKm2, space, monthsUntil(goal.by_date));
  const { mix } = feas;
  const curated = country === 'BD' ? curatedList(lang) : [];
  const ref = REF_COSTS[country ?? ''] ?? REF_COSTS.default;

  let ai: AiPlan | null = null;
  try {
    ai = await structured({
      schema: AiPlan,
      name: 'cooling_plan',
      instructions: PLAN_PROMPT(lang, country),
      input: JSON.stringify({
        zone: { name: goal.zone_name, area_km2: round(areaKm2, 3), drivers, heat_score: req.zone?.score ?? null },
        goal: { target_c: goal.target_c, by_date: goal.by_date },
        quantities: { trees: mix.trees, cool_roof_m2: mix.roof_m2, shade_structures: mix.shade },
        space,
        species_list: curated.map((s) => ({ id: s.id, name: s.name, scientific: s.scientific, canopy_m: s.canopy_m, water: s.water })),
        reference_prices: ref,
      }),
      label: 'plan',
      maxOutputTokens: 3000,
    });
    sources.push(SRC.ai);
  } catch {
    // deterministic fallback below
  }

  const costs = ai && ai.unit_costs.tree > 0 && ai.unit_costs.currency.length === 3 ? { ...ai.unit_costs, currency: ai.unit_costs.currency.toUpperCase() } : ref;
  const est = !!ai;
  const cur = costs.currency;
  const waterPerTree = ai && ai.water_l_week_per_tree > 0 && ai.water_l_week_per_tree < 200 ? ai.water_l_week_per_tree : WATER_L_WEEK_PER_TREE;

  const actions: PlanAction[] = [
    {
      action_type: 'plant_tree',
      qty: mix.trees,
      cooling_c: round(mix.trees * treeCoolingC(areaKm2), 2),
      cost: money(mix.trees * costs.tree, cur),
      water_l_week: Math.round(mix.trees * waterPerTree),
      effort: mix.trees > 150 ? 'high' : 'medium',
      why: { code: 'plan.why.plant_tree', params: { trees: mix.trees } },
      estimate: est,
    },
    {
      action_type: 'cool_roof',
      qty: Math.ceil(mix.roof_m2 / 10),
      cooling_c: round(mix.roof_m2 * roofCoolingC(areaKm2), 2),
      cost: money(mix.roof_m2 * costs.roof_m2, cur),
      water_l_week: 0,
      effort: 'medium',
      why: { code: 'plan.why.cool_roof', params: { roof_m2: mix.roof_m2 } },
      estimate: est,
    },
    {
      action_type: 'shade_structure',
      qty: mix.shade,
      cooling_c: round(mix.shade * shadeCoolingC(areaKm2), 2),
      cost: money(mix.shade * costs.shade, cur),
      water_l_week: 0,
      effort: 'low',
      why: { code: 'plan.why.shade_structure', params: { shade: mix.shade } },
      estimate: est,
    },
    { action_type: 'awareness', qty: 1, cooling_c: 0, cost: money(0, cur), water_l_week: 0, effort: 'low', why: { code: 'plan.why.awareness' } },
  ].filter((a) => a.qty > 0) as PlanAction[];

  // Rank by cooling per unit of money (cheapest cooling first), awareness last.
  actions.sort((a, b) => (b.cooling_c / Math.max(1, b.cost.amount) || -1) - (a.cooling_c / Math.max(1, a.cost.amount) || -1));

  const lines: BudgetLine[] = [
    { label: { code: 'budget.trees' }, qty: mix.trees, unit_cost: money(costs.tree, cur), total: money(mix.trees * costs.tree, cur), estimate: est || undefined },
    { label: { code: 'budget.cool_roof' }, qty: mix.roof_m2, unit_cost: money(costs.roof_m2, cur), total: money(mix.roof_m2 * costs.roof_m2, cur), estimate: est || undefined },
    { label: { code: 'budget.shade' }, qty: mix.shade, unit_cost: money(costs.shade, cur), total: money(mix.shade * costs.shade, cur), estimate: est || undefined },
  ].filter((l) => l.qty > 0);
  const budget: Budget = {
    lines,
    total: money(
      lines.reduce((a, l) => a + l.total.amount, 0),
      cur,
    ),
    water_l_week: Math.round(mix.trees * waterPerTree),
    care_per_year: money(mix.trees * costs.care_tree_year, cur),
  };

  let species: SpeciesSummary[] = [];
  if (curated.length) {
    const ids = ai?.species_ids.filter((id) => curated.some((s) => s.id === id)) ?? [];
    species = (ids.length ? ids : ['neem', 'krish', 'arjun', 'jarul']).map((id) => curated.find((s) => s.id === id) as SpeciesSummary).slice(0, 5);
  } else if (ai?.extra_species.length) {
    species = ai.extra_species.map((s, i) => ({
      id: `ai-plan-${i}`,
      name: s.name,
      scientific: s.scientific,
      canopy_m: s.canopy_m,
      cooling: s.canopy_m >= 12 ? 'high' : s.canopy_m >= 8 ? 'medium' : 'low',
      water: s.water,
      price: null,
      emoji: '🌳',
    }));
  }

  const steps = ai?.steps.length ? ai.steps.slice(0, 5) : fallbackSteps(lang, mix.trees, mix.roof_m2);
  return {
    goal_id: goal.id,
    feasibility: { feasible: feas.feasible, needed: feas.needed, spots_available: feas.spots_available, notes: feas.notes },
    actions,
    species,
    steps,
    next_task: { action_type: 'plant_tree', text: ai?.next_task ?? steps[0].title },
    budget,
    care_plan: ai?.care_plan ?? null,
    meta: makeMeta(live && !!ai, [...sources, ...(curated.length ? [SRC.curated] : [])]),
  };
}
