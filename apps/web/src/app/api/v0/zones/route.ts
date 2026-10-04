import { z } from 'zod';

import { CACHE, handler, json, parseQuery, zLang, zLat, zLng, zRadius } from '@/server/api';
import { getZones, scanIsWarm } from '@/server/heat/scan';
import { deviceCookie, deviceOf, takeScan } from '@/server/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Q = z.object({ lat: zLat, lng: zLng, radius_m: zRadius, lang: zLang });

export const GET = handler(async (req) => {
  const q = parseQuery(req, Q);
  const p = { lat: q.lat, lng: q.lng };
  const dev = deviceOf(req);
  // Only cold scans (a new Overpass query) count against the 30/hour limit.
  if (!(await scanIsWarm(p, q.radius_m))) takeScan(dev);
  const data = await getZones(p, q.radius_m, q.lang);
  return json(data, { cache: dev.isNew ? CACHE.none : CACHE.priv(300), headers: deviceCookie(dev) });
});
