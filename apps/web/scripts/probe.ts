/**
 * npm run probe — call every /api/v0 route handler for the Dhaka demo point and print
 * status, timing and meta.live. No dev server needed: the handlers are imported and called with a
 * NextRequest. Pass `--base http://localhost:3000` to probe a running server over HTTP instead.
 * Flags: --no-ai (skip /ask and /plan AI), --photo (also POST verify-photo and tree-check with a tiny image).
 */
import { NextRequest } from 'next/server';

import { env } from '@/server/env';

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;
const noAi = args.includes('--no-ai');
const photo = args.includes('--photo');
const { lat, lng } = env.demo;
// 1×1 white JPEG (enough to exercise the route; the AI will return pending).
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function call(method: 'GET' | 'POST', path: string, mod: () => Promise<Record<string, unknown>>, params: Record<string, string> = {}, body?: unknown) {
  const url = `${base ?? 'http://localhost'}${path}`;
  const init = { method, headers: { 'content-type': 'application/json', cookie: 'atmos_device=probe0000device' }, body: body ? JSON.stringify(body) : undefined };
  const t0 = performance.now();
  let res: Response;
  try {
    if (base) res = await fetch(url, init);
    else {
      const m = await mod();
      const h = m[method] as Handler;
      res = await h(new NextRequest(url, init), { params: Promise.resolve(params) });
    }
  } catch (e) {
    console.log(`ERR  ${method} ${path} ${e instanceof Error ? e.message : e}`);
    return null;
  }
  const ms = Math.round(performance.now() - t0);
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('event-stream')) {
    const text = await res.text();
    const events = [...text.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);
    const counts = events.reduce<Record<string, number>>((a, e) => ((a[e] = (a[e] ?? 0) + 1), a), {});
    const answer = [...text.matchAll(/^data: (.*)$/gm)]
      .map((m) => JSON.parse(m[1]) as { type: string; text?: string })
      .filter((e) => e.type === 'token')
      .map((e) => e.text)
      .join('');
    console.log(`${res.status}  ${String(ms).padStart(6)}ms  ${method} ${path}  events=${JSON.stringify(counts)}\n      “${answer.slice(0, 160).replace(/\s+/g, ' ')}…”`);
    return null;
  }
  const j = (await res.json()) as { meta?: { live: boolean }; code?: string; message?: string } & Record<string, unknown>;
  const live = j.meta ? `live=${j.meta.live}` : j.code ? `code=${j.code} ${j.message ?? ''}` : '';
  console.log(`${res.status}  ${String(ms).padStart(6)}ms  ${method} ${path}  ${live}`);
  return j;
}

async function main() {
  console.log(`Probe ${base ?? '(in-process handlers)'} at ${lat}, ${lng}\n`);
  const q = `lat=${lat}&lng=${lng}`;
  await call('GET', `/api/v0/conditions?${q}&lang=bn`, () => import('@/app/api/v0/conditions/route'));
  await call('GET', `/api/v0/geo/reverse?${q}&lang=en`, () => import('@/app/api/v0/geo/reverse/route'));
  await call('GET', `/api/v0/geo/search?q=Dhaka&lang=en`, () => import('@/app/api/v0/geo/search/route'));
  const zones = (await call('GET', `/api/v0/zones?${q}&radius_m=500&lang=en`, () => import('@/app/api/v0/zones/route'))) as { zones?: { id: string }[]; my_zone_id?: string } | null;
  await call('GET', `/api/v0/zones?${q}&radius_m=500&lang=en`, () => import('@/app/api/v0/zones/route'));
  const id = zones?.my_zone_id ?? zones?.zones?.[0]?.id ?? 'z-8a3cf10ce3b7fff-500';
  await call('GET', `/api/v0/zones/${id}?lang=bn`, () => import('@/app/api/v0/zones/[id]/route'), { id });
  await call('GET', `/api/v0/zones/${id}/projection?trees=120&roof_m2=800&shade=2`, () => import('@/app/api/v0/zones/[id]/projection/route'), { id });
  await call('GET', `/api/v0/zones/${id}/planting-spots`, () => import('@/app/api/v0/zones/[id]/planting-spots/route'), { id });
  await call('GET', `/api/v0/zones/z-000000000000000-500`, () => import('@/app/api/v0/zones/[id]/route'), { id: 'z-000000000000000-500' });
  await call('GET', `/api/v0/species?${q}&lang=bn`, () => import('@/app/api/v0/species/route'));
  await call('GET', `/api/v0/species/neem?lang=en`, () => import('@/app/api/v0/species/[id]/route'), { id: 'neem' });
  await call('GET', `/api/v0/nurseries?${q}&radius_m=10000`, () => import('@/app/api/v0/nurseries/route'));
  await call('GET', `/api/v0/air?${q}`, () => import('@/app/api/v0/air/route'));
  await call('GET', `/api/v0/farm/alerts?${q}&crop=boro&stage=flowering&lang=bn`, () => import('@/app/api/v0/farm/alerts/route'));
  await call('GET', `/api/v0/conditions?lat=999&lng=0`, () => import('@/app/api/v0/conditions/route'));
  if (!noAi) {
    await call('POST', '/api/v0/plan', () => import('@/app/api/v0/plan/route'), {}, {
      goal: { id: 'probe-goal', zone_id: id, zone_name: 'Probe zone', zone_centroid: { lat, lng }, target_c: -1.5, by_date: '2027-10-01' },
      lang: 'bn',
    });
    await call('POST', '/api/v0/ask', () => import('@/app/api/v0/ask/route'), {}, {
      message: 'আমার এলাকা এত গরম কেন?',
      screen: 'S04',
      lang: 'bn',
      context: { lat, lng },
      client_state: { profile: 'user', units: 'C', farmer: false },
    });
  }
  if (photo) {
    await call('POST', '/api/v0/verify-photo', () => import('@/app/api/v0/verify-photo/route'), {}, {
      image: TINY_JPEG, action_type: 'plant_tree', quantity: 1, taken_at: new Date().toISOString(), lat, lng, target: { lat, lng }, lang: 'en',
    });
    await call('POST', '/api/v0/tree-check', () => import('@/app/api/v0/tree-check/route'), {}, { image: TINY_JPEG, species_id: 'neem', lang: 'en' });
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
