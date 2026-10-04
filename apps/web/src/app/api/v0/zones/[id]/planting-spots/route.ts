import { apiError, CACHE, handler, json } from '@/server/api';
import { scanForZone } from '@/server/heat/scan';
import { getPlantingSpots } from '@/server/plan/spots';
import { snapshot } from '@/server/snapshots';
import type { PlantingSpots } from '@/lib/data/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const found = await scanForZone(id).catch(() => null);
  if (!found) {
    const snap = snapshot<PlantingSpots>(`spots.${id}`, null);
    if (snap) return json({ ...snap, meta: { ...snap.meta, live: false } }, { cache: CACHE.pub(60) });
    return apiError(404, 'zone.not_found', `No zone ${id}.`);
  }
  return json(await getPlantingSpots(id, found.zone.h3), { cache: CACHE.pub(86_400) });
});
