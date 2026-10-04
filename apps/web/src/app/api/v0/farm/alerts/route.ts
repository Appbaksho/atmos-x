import { z } from 'zod';

import type { CropId, StageId } from '@/lib/data/types';
import { CACHE, handler, json, parseQuery, zLang, zLat, zLng } from '@/server/api';
import { CROPS, farmAlertsOrSnapshot, STAGES } from '@/server/farm/alerts';

export const runtime = 'nodejs';
export const maxDuration = 45;

const Q = z.object({
  lat: zLat,
  lng: zLng,
  crop: z.enum(CROPS as [CropId, ...CropId[]]).default('boro'),
  stage: z.enum(STAGES as [StageId, ...StageId[]]).default('vegetative'),
  lang: zLang,
});

export const GET = handler(async (req) => {
  const q = parseQuery(req, Q);
  return json(await farmAlertsOrSnapshot({ lat: q.lat, lng: q.lng }, q.crop, q.stage, q.lang), { cache: CACHE.pub(1800) });
});
