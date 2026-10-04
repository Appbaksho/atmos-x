import { z } from 'zod';

import { CACHE, handler, json, parseBody, zLang, zLatLng } from '@/server/api';
import { buildPlan } from '@/server/plan/plan';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({
  goal: z.object({
    id: z.string().min(1).max(80),
    zone_id: z.string().min(1).max(80),
    zone_name: z.string().max(120),
    zone_centroid: zLatLng,
    target_c: z.number().min(-5).max(5),
    by_date: z.string().max(40),
  }),
  zone: z
    .object({
      drivers: z.object({
        sealed_pct: z.number(),
        green_pct: z.number(),
        ndvi: z.number().nullable(),
        dark_roof_pct: z.number().nullable(),
        pop_density_km2: z.number().nullable(),
        night_lst_c: z.number().nullable(),
        estimated: z.array(z.enum(['sealed_pct', 'green_pct', 'ndvi', 'dark_roof_pct', 'pop_density_km2', 'night_lst_c'])).optional(),
      }),
      score: z.number(),
      lst_c: z.number(),
      h3: z.array(z.string().regex(/^[0-9a-f]{15}$/)).max(400),
    })
    .nullish(),
  lang: zLang,
});

export const POST = handler(async (req) => {
  const body = await parseBody(req, Body, 256 * 1024);
  return json(await buildPlan(body), { cache: CACHE.none });
});
