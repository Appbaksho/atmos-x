import { z } from 'zod';

import { treeCheck } from '@/server/ai/tree-check';
import { apiError, CACHE, handler, json, parseBody, zImage, zLang } from '@/server/api';
import { makeMeta, SRC } from '@/server/meta';
import { AiUnavailable } from '@/server/openai';
import { deviceCookie, deviceOf, takePhotoCheck } from '@/server/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 45;

const Body = z.object({ image: zImage, species_id: z.string().min(1).max(60), lang: zLang });

export const POST = handler(async (req) => {
  const dev = deviceOf(req);
  const body = await parseBody(req, Body);
  takePhotoCheck(dev);
  try {
    const r = await treeCheck(body);
    return json({ ...r, meta: makeMeta(true, [SRC.ai]) }, { cache: CACHE.none, headers: deviceCookie(dev) });
  } catch (e) {
    if (e instanceof AiUnavailable) return apiError(503, 'ai_unavailable', 'The photo check is not available right now. Try again later.', deviceCookie(dev));
    throw e;
  }
});
