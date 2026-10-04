import { z } from 'zod';

import { LOCALES } from '@/lib/data/types';
import { askStream, sseEncode } from '@/server/ai/ask';
import { handler, parseBody, zImage } from '@/server/api';
import { deviceCookie, deviceOf, takeAsk } from '@/server/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SCREENS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12', 'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21', 'S22', 'S26', 'S27', 'S28', 'S29', 'F01', 'F02', 'F03'] as const;

const Body = z.object({
  message: z.string().trim().min(1).max(1000),
  screen: z.enum(SCREENS).default('S04'),
  lang: z.enum(LOCALES).default('en'),
  context: z
    .object({
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      zone_id: z.string().max(40).optional(),
      tree_id: z.string().max(80).optional(),
      field_id: z.string().max(80).optional(),
    })
    .optional(),
  client_state: z
    .object({
      profile: z.enum(['guest', 'user']).default('guest'),
      units: z.enum(['C', 'F']).default('C'),
      farmer: z.boolean().default(false),
      trees: z
        .array(
          z.object({
            id: z.string(),
            nickname: z.string(),
            species_id: z.string(),
            status: z.enum(['ok', 'due', 'overdue']),
            health: z.enum(['healthy', 'stressed', 'dead']),
            next_due_at: z.string(),
          }),
        )
        .max(30)
        .optional(),
      goal: z.object({ zone_name: z.string(), target_c: z.number(), by_date: z.string(), progress_pct: z.number() }).nullish(),
      visible: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }))
    .max(12)
    .optional(),
  image: zImage.nullish(),
});

export const POST = handler(async (req) => {
  const dev = deviceOf(req);
  const body = await parseBody(req, Body);
  if (JSON.stringify(body.client_state ?? {}).length > 12 * 1024) body.client_state = { ...body.client_state!, visible: undefined };
  const { remaining } = takeAsk(dev, body.client_state?.profile);
  const enc = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener('abort', () => abort.abort());
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(': atmos\n\n'));
      try {
        for await (const ev of askStream(body, { remaining, signal: abort.signal })) {
          if (abort.signal.aborted) break;
          controller.enqueue(enc.encode(sseEncode(ev)));
        }
      } catch (e) {
        controller.enqueue(enc.encode(sseEncode({ type: 'error', code: 'internal', message: e instanceof Error ? e.message.slice(0, 160) : 'error' })));
        controller.enqueue(enc.encode(sseEncode({ type: 'done', message_id: 'error', remaining_today: remaining })));
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...deviceCookie(dev),
    },
  });
});
