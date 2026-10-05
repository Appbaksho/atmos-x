import { z } from 'zod';

import { CACHE, handler, json, parseQuery, zLat, zLng } from '@/server/api';
import { getNurseries } from '@/server/places/nurseries';

export const runtime = 'nodejs';
export const maxDuration = 45;

const Q = z.object({ lat: zLat, lng: zLng, radius_m: z.coerce.number().int().min(100).max(25_000).default(10_000) });

export const GET = handler(async (req) => {
  const q = parseQuery(req, Q);
  return json(await getNurseries({ lat: q.lat, lng: q.lng }, q.radius_m), { cache: CACHE.pub(86_400) });
});
