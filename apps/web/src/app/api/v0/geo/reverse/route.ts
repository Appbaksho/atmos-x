import { z } from 'zod';

import { CACHE, handler, json, parseQuery, zLang, zLat, zLng } from '@/server/api';
import { reverseResponse } from '@/server/geo/geo';

export const runtime = 'nodejs';

const Q = z.object({ lat: zLat, lng: zLng, lang: zLang });

export const GET = handler(async (req) => {
  const q = parseQuery(req, Q);
  return json(await reverseResponse({ lat: q.lat, lng: q.lng }, q.lang), { cache: CACHE.pub(86_400) });
});
