import { z } from 'zod';

import type { Air } from '@/lib/data/types';
import { getAir } from '@/server/air/air';
import { CACHE, handler, json, parseQuery, zLat, zLng } from '@/server/api';
import { snapshot } from '@/server/snapshots';

export const runtime = 'nodejs';

const Q = z.object({ lat: zLat, lng: zLng });

export const GET = handler(async (req) => {
  const q = parseQuery(req, Q);
  const p = { lat: q.lat, lng: q.lng };
  try {
    return json(await getAir(p), { cache: CACHE.pub(1800) });
  } catch (e) {
    const snap = snapshot<Air>('air', p);
    if (snap) return json({ ...snap, meta: { ...snap.meta, live: false } }, { cache: CACHE.pub(60) });
    throw e;
  }
});
