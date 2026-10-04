import { z } from 'zod';

import { CACHE, handler, json, parseQuery, zLang } from '@/server/api';
import { searchPlaces } from '@/server/geo/geo';

export const runtime = 'nodejs';

const Q = z.object({ q: z.string().trim().min(2).max(80), lang: zLang });

export const GET = handler(async (req) => {
  const q = parseQuery(req, Q);
  return json(await searchPlaces(q.q, q.lang), { cache: CACHE.pub(86_400) });
});
