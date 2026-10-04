import { z } from 'zod';

import { apiError, CACHE, handler, json, parseQuery, zLang, zLat, zLng } from '@/server/api';
import { getSpecies } from '@/server/plan/species';

export const runtime = 'nodejs';
export const maxDuration = 45;

const Q = z.object({ lat: zLat.optional(), lng: zLng.optional(), lang: zLang });

export const GET = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const q = parseQuery(req, Q);
  const p = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
  const s = await getSpecies(id, p, q.lang);
  if (!s) return apiError(404, 'species.not_found', `No species ${id}${id.startsWith('ai-') && !p ? ' (AI species need lat & lng)' : ''}.`);
  return json(s, { cache: CACHE.pub(86_400) });
});
