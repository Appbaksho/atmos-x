import { z } from 'zod';

import { CACHE, handler, json, parseQuery, zLang, zLat, zLng } from '@/server/api';
import { getSpeciesList } from '@/server/plan/species';

export const runtime = 'nodejs';
export const maxDuration = 45;

const Q = z.object({ lat: zLat.optional(), lng: zLng.optional(), lang: zLang });

export const GET = handler(async (req) => {
  const q = parseQuery(req, Q);
  const p = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
  return json(await getSpeciesList(p, q.lang), { cache: CACHE.pub(86_400) });
});
