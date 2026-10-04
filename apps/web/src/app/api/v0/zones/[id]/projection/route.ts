import { cellArea } from 'h3-js';
import { z } from 'zod';

import type { Projection } from '@/lib/data/types';
import { apiError, CACHE, handler, json, parseQuery } from '@/server/api';
import { scanForZone } from '@/server/heat/scan';
import { getProjection } from '@/server/plan/projection';
import { snapshot } from '@/server/snapshots';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Q = z.object({
  trees: z.coerce.number().int().min(0).max(100_000).default(100),
  roof_m2: z.coerce.number().min(0).max(1_000_000).default(500),
  shade: z.coerce.number().int().min(0).max(1000).default(0),
});

export const GET = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const q = parseQuery(req, Q);
  const found = await scanForZone(id).catch(() => null);
  if (!found) {
    const snap = snapshot<Projection>(`projection.${id}`, null);
    if (snap) return json({ ...snap, meta: { ...snap.meta, live: false } }, { cache: CACHE.pub(60) });
    return apiError(404, 'zone_not_found', `No zone ${id}.`);
  }
  const area = found.zone.h3.reduce((a, h) => a + cellArea(h, 'km2'), 0);
  return json(await getProjection(found.zone.centroid, area, q), { cache: CACHE.pub(3600) });
});
