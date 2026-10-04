import 'server-only';

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInput } from 'openai/resources/responses/responses';
import type { z } from 'zod';

import { env } from './env';
import { logTiming } from './util';

/**
 * OpenAI access (Responses API, openai v7). The key stays on the server. A global daily cap
 * (AI_DAILY_REQUEST_CAP) protects the key; once reached, AI features return canned fallbacks.
 */

let client: OpenAI | null = null;

export function openai(): OpenAI | null {
  if (!env.openaiKey) return null;
  client ??= new OpenAI({ apiKey: env.openaiKey, maxRetries: 1, timeout: 30_000 });
  return client;
}

export const models = {
  get main() {
    return env.model;
  },
  get cheap() {
    return env.modelCheap;
  },
};

export class AiUnavailable extends Error {
  code: 'ai_disabled' | 'ai_cap' | 'ai_error';
  constructor(code: AiUnavailable['code'], message: string) {
    super(message);
    this.name = 'AiUnavailable';
    this.code = code;
  }
}

let capDay = '';
let capUsed = 0;

/** Reserve one AI request from the global daily budget. */
export function takeAiBudget(): void {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== capDay) {
    capDay = day;
    capUsed = 0;
  }
  if (!openai()) throw new AiUnavailable('ai_disabled', 'OPENAI_API_KEY is not set');
  if (capUsed >= env.aiDailyCap) throw new AiUnavailable('ai_cap', 'Global daily AI cap reached');
  capUsed++;
}

export function aiBudgetUsed(): { used: number; cap: number } {
  return { used: capUsed, cap: env.aiDailyCap };
}

export type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

/**
 * One structured-output call: the model's JSON is validated by the zod schema (strict JSON schema
 * on the API side via zodTextFormat, then parsed again here).
 */
export async function structured<S extends z.ZodType>(opts: {
  schema: S;
  name: string;
  instructions: string;
  input: string | ResponseInput;
  model?: string;
  effort?: Effort;
  maxOutputTokens?: number;
  timeoutMs?: number;
  label?: string;
}): Promise<z.infer<S>> {
  takeAiBudget();
  const c = openai() as OpenAI;
  const t0 = performance.now();
  const model = opts.model ?? models.cheap;
  try {
    const res = await c.responses.parse(
      {
        model,
        instructions: opts.instructions,
        input: opts.input,
        reasoning: { effort: opts.effort ?? 'low' },
        max_output_tokens: opts.maxOutputTokens ?? 2000,
        store: false,
        text: { format: zodTextFormat(opts.schema, opts.name) },
      },
      { timeout: opts.timeoutMs ?? 25_000, maxRetries: 1 },
    );
    const parsed = res.output_parsed;
    if (parsed == null) throw new AiUnavailable('ai_error', `no structured output (${res.status ?? 'unknown'})`);
    logTiming(`ai.${opts.label ?? opts.name}`, t0, `${model} ${res.usage?.input_tokens ?? '?'}→${res.usage?.output_tokens ?? '?'} tok`);
    return opts.schema.parse(parsed) as z.infer<S>;
  } catch (e) {
    logTiming(`ai.${opts.label ?? opts.name} FAILED`, t0, e instanceof Error ? e.message.slice(0, 160) : '');
    if (e instanceof AiUnavailable) throw e;
    throw new AiUnavailable('ai_error', e instanceof Error ? e.message : String(e));
  }
}

/** Plain-text call (short explanations). */
export async function text(opts: { instructions: string; input: string; model?: string; effort?: Effort; maxOutputTokens?: number; timeoutMs?: number; label?: string }): Promise<string> {
  takeAiBudget();
  const c = openai() as OpenAI;
  const t0 = performance.now();
  const model = opts.model ?? models.cheap;
  try {
    const res = await c.responses.create(
      {
        model,
        instructions: opts.instructions,
        input: opts.input,
        reasoning: { effort: opts.effort ?? 'low' },
        max_output_tokens: opts.maxOutputTokens ?? 1200,
        store: false,
      },
      { timeout: opts.timeoutMs ?? 20_000, maxRetries: 1 },
    );
    const out = res.output_text.trim();
    if (!out) throw new AiUnavailable('ai_error', `empty output (${res.status ?? 'unknown'})`);
    logTiming(`ai.${opts.label ?? 'text'}`, t0, `${model} ${res.usage?.input_tokens ?? '?'}→${res.usage?.output_tokens ?? '?'} tok`);
    return out;
  } catch (e) {
    logTiming(`ai.${opts.label ?? 'text'} FAILED`, t0, e instanceof Error ? e.message.slice(0, 160) : '');
    if (e instanceof AiUnavailable) throw e;
    throw new AiUnavailable('ai_error', e instanceof Error ? e.message : String(e));
  }
}

/** Shrink a data URL check: we only forward images the route already validated. */
export function imageInput(dataUrl: string, detail: 'low' | 'high' | 'auto' = 'auto') {
  return { type: 'input_image' as const, image_url: dataUrl, detail };
}
