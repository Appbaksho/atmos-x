import { z } from 'zod';

import { apiError, CACHE, handler, json, parseQuery, zLang } from '@/server/api';
import { getZoneDetail } from '@/server/heat/zone';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Q = z.object({ lang: zLang });

export const GET = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const q = parseQuery(req, Q);
  const d = await getZoneDetail(id, q.lang);
  if (!d) return apiError(404, 'zone.not_found', `No zone ${id}. Scan again to get fresh zone ids.`);
  return json(d, { cache: CACHE.pub(600) });
});
