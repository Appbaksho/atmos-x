import { z } from 'zod';

import type { ActionTypeId } from '@/lib/data/types';
import { verifyPhoto } from '@/server/ai/verify';
import { CACHE, handler, json, parseBody, zImage, zLang, zLatLng } from '@/server/api';
import { makeMeta, SRC } from '@/server/meta';
import { deviceCookie, deviceOf, takePhotoCheck } from '@/server/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 45;

const ACTIONS: [ActionTypeId, ...ActionTypeId[]] = ['plant_tree', 'plant_shrubs', 'rooftop_garden', 'cool_roof', 'green_wall', 'shade_structure', 'water_tree', 'awareness'];

const Body = z.object({
  image: zImage,
  action_type: z.enum(ACTIONS),
  quantity: z.number().min(0).max(10_000),
  taken_at: z.string().max(40),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  target: zLatLng.nullable(),
  lang: zLang,
});

export const POST = handler(async (req) => {
  const dev = deviceOf(req);
  const body = await parseBody(req, Body);
  takePhotoCheck(dev);
  const r = await verifyPhoto(body);
  return json({ ...r, meta: makeMeta(r.reason_code !== 'ai_unavailable', [SRC.ai]) }, { cache: CACHE.none, headers: deviceCookie(dev) });
});
