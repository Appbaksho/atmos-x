import { z } from 'zod';

import type { Conditions } from '@/lib/data/types';
import { CACHE, handler, json, parseQuery, zLang, zLat, zLng } from '@/server/api';
import { snapshot } from '@/server/snapshots';
import { getConditions } from '@/server/weather/conditions';

export const runtime = 'nodejs';
export const maxDuration = 30;

const Q = z.object({ lat: zLat, lng: zLng, lang: zLang });

export const GET = handler(async (req) => {
  const q = parseQuery(req, Q);
  const p = { lat: q.lat, lng: q.lng };
  try {
    return json(await getConditions(p, q.lang), { cache: CACHE.pub(600) });
  } catch (e) {
    const snap = snapshot<Conditions>(`conditions.${q.lang}`, p) ?? snapshot<Conditions>('conditions.en', p);
    if (snap) return json({ ...snap, meta: { ...snap.meta, live: false } }, { cache: CACHE.pub(60) });
    throw e;
  }
});
