import 'server-only';

import type OpenAI from 'openai';
import type { ResponseInput, ResponseInputItem, Response as OAResponse } from 'openai/resources/responses/responses';
import { toResponseInputItems } from 'openai/lib/responses/ResponseInputItems';

import type { AskAction, AskEvent, AskRequest, CropId, Locale, ScreenId, Source, StageId } from '@/lib/data/types';

import { env } from '../env';
import { getAir } from '../air/air';
import { CROPS, farmAlertsOrSnapshot, STAGES } from '../farm/alerts';
import { scanIsWarm } from '../heat/scan';
import { getZoneDetail } from '../heat/zone';
import { getConditions } from '../weather/conditions';
import { renderText, serverT } from '../i18n';
import { AiUnavailable, models, openai, takeAiBudget } from '../openai';
import { errMsg, logTiming } from '../util';
import { cannedAnswer, type CannedData, chunks, type Kind, kindOf, screenKind } from './canned';
import { ASK_PROMPT } from './prompts';
import { runTool, TOOL_DEFS, type ToolCtx, type ToolName, type ToolResult } from './tools';

/**
 * Ask Atmos (§5.2): an async generator of AskEvents, in order: warning(s) → token… → sources →
 * action (≤ 2) → done. notice/error may appear anywhere. The route turns it into SSE.
 */

const MAX_ROUNDS = 3;
const CLIENT_STATE_MAX = 6 * 1024;

/** Tools to prefetch for a screen (so the first answer needs no tool round-trip). */
export function prefetchFor(screen: ScreenId, kind: Kind, hasZone: boolean): ToolName[] {
  const set = new Set<ToolName>();
  if (screen === 'S06' || screen === 'S07' || ((screen === 'S08' || screen === 'S09') && hasZone)) set.add('get_zone');
  if (screen === 'S26' || screen === 'S27' || screen === 'S28') set.add('get_air');
  if (screen.startsWith('F')) set.add('get_farm_alerts');
  if (screen === 'S10' || screen === 'S11') set.add('get_species');
  if (screen === 'S12') set.add('find_nurseries');
  if (kind === 'heat') set.add('get_conditions');
  if (kind === 'air') set.add('get_air');
  if (kind === 'farm') set.add('get_farm_alerts');
  if (kind === 'heat' && hasZone) set.add('get_zone');
  if (!set.size) set.add('get_conditions');
  return [...set];
}

/** Suggested navigation (shown as buttons; navigation only happens when the user taps). */
export function actionsFor(kind: Kind, ctx: { zoneId?: string | null; alertId?: string | null; screen: ScreenId }): AskAction[] {
  const out: AskAction[] = [];
  if (kind === 'heat') {
    if (ctx.zoneId && ctx.screen !== 'S06') out.push({ label: { code: 'action.open_zone' }, screen: 'S06', params: { id: ctx.zoneId } });
    out.push({ label: { code: 'action.create_goal' }, screen: 'S08', params: ctx.zoneId ? { zone_id: ctx.zoneId } : undefined });
  } else if (kind === 'air') {
    if (ctx.screen !== 'S26') out.push({ label: { code: 'action.open_air' }, screen: 'S26' });
  } else if (kind === 'farm') {
    out.push(ctx.alertId ? { label: { code: 'action.see_alert' }, screen: 'F02', params: { id: ctx.alertId } } : { label: { code: 'action.open_farm' }, screen: 'F01' });
  } else {
    if (ctx.screen !== 'S20') out.push({ label: { code: 'action.open_trees' }, screen: 'S20' });
    out.push({ label: { code: 'action.find_nurseries' }, screen: 'S12' });
  }
  return out.slice(0, 2);
}

function compactState(req: AskRequest): string {
  const s = JSON.stringify(req.client_state ?? {});
  return s.length <= CLIENT_STATE_MAX ? s : s.slice(0, CLIENT_STATE_MAX) + '…(truncated)';
}

function farmCtx(req: AskRequest): { crop: CropId; stage: StageId } {
  const v = (req.client_state?.visible ?? {}) as Record<string, unknown>;
  const crop = (CROPS as string[]).includes(String(v.crop)) ? (v.crop as CropId) : 'boro';
  const stage = (STAGES as string[]).includes(String(v.stage)) ? (v.stage as StageId) : 'flowering';
  return { crop, stage };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function* askStream(req: AskRequest, opts: { remaining: number; signal?: AbortSignal }): AsyncGenerator<AskEvent> {
  const t0 = performance.now();
  const lang: Locale = req.lang;
  const farmer = req.client_state?.farmer ?? false;
  const kind = kindOf(req.message, screenKind(req.screen, farmer));
  const focus = req.context?.lat != null && req.context?.lng != null ? { lat: req.context.lat, lng: req.context.lng } : env.demo;
  const ctx: ToolCtx = { lang, focus, zoneId: req.context?.zone_id, ...farmCtx(req) };
  const sources = new Map<string, Source>();
  const addSources = (r: ToolResult) => r.sources.forEach((s) => sources.set(s.id, s));
  const results = new Map<ToolName, ToolResult>();
  const messageId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

  // 1) Prefetch the obvious tools and the warning inputs in parallel.
  const pre = prefetchFor(req.screen, kind, !!ctx.zoneId);
  // Heat question without a zone on screen: prefetch the user's own zone when the scan is already cached.
  if (kind === 'heat' && !ctx.zoneId && !pre.includes('get_zone') && (await scanIsWarm(focus, 500))) pre.push('get_zone');
  const wantFarmWarn = farmer || kind === 'farm' || req.screen.startsWith('F');
  const need = new Set<ToolName>([...pre, 'get_conditions', ...(wantFarmWarn ? (['get_farm_alerts'] as ToolName[]) : [])]);
  const fetched = await Promise.all([...need].map((n) => runTool(n, {}, ctx)));
  fetched.forEach((r) => results.set(r.name, r));
  logTiming('ask.prefetch', t0, [...need].join(','));

  // 2) Warnings always come first.
  const cond = results.get('get_conditions');
  if (cond?.ok) {
    const w = (cond.output as { warnings?: { source: 'BMD' | 'local'; text: string }[] }).warnings ?? [];
    for (const x of w) yield { type: 'warning', source: x.source, text: typeof x.text === 'string' ? x.text : '' };
  }
  const farm = results.get('get_farm_alerts');
  let alertId: string | null = null;
  if (farm?.ok) {
    const alerts = (farm.output as { alerts?: { id: string; level: string; title: string; body: string }[] }).alerts ?? [];
    alertId = alerts[0]?.id ?? null;
    for (const a of alerts.filter((x) => x.level === 'danger').slice(0, 2)) yield { type: 'warning', source: 'local', text: `${a.title}: ${a.body}` };
  }
  for (const n of pre) {
    const r = results.get(n);
    if (r?.ok) addSources(r);
  }
  if (cond?.ok && kind === 'heat') addSources(cond);

  // 3) The model, with tools; canned fallback if it fails before the first token.
  let produced = '';
  let zoneId: string | null = ctx.zoneId ?? (results.get('get_zone')?.output as { id?: string } | undefined)?.id ?? null;
  try {
    const client = openai();
    if (!client) throw new AiUnavailable('ai_disabled', 'no key');
    const prefetched = Object.fromEntries(pre.map((n) => [n, results.get(n)?.output]));
    const history: ResponseInputItem[] = (req.history ?? []).slice(-6).map((h) =>
      h.role === 'user'
        ? { role: 'user', content: h.text.slice(0, 2000) }
        : { role: 'assistant', content: h.text.slice(0, 2000) },
    );
    const userContent: ResponseInputItem = req.image
      ? { role: 'user', content: [{ type: 'input_text', text: req.message }, { type: 'input_image', image_url: req.image, detail: 'auto' }] }
      : { role: 'user', content: req.message };
    let input: ResponseInput = [
      {
        role: 'developer',
        content: `App context (JSON): ${JSON.stringify({ screen: req.screen, focus, context: req.context ?? {}, topic: kind, prefetched_tool_results: prefetched })}\nApp summary from the device (client_state): ${compactState(req)}`,
      },
      ...history,
      userContent,
    ];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      takeAiBudget();
      const stream = await (client as OpenAI).responses.create(
        {
          model: models.main,
          instructions: ASK_PROMPT(lang, req.screen, req.client_state?.units ?? 'C'),
          input,
          tools: TOOL_DEFS,
          reasoning: { effort: 'low' },
          max_output_tokens: 1500,
          store: false,
          include: ['reasoning.encrypted_content'],
          stream: true,
        },
        { timeout: 30_000, maxRetries: produced ? 0 : 1, signal: opts.signal },
      );
      let final: OAResponse | null = null;
      for await (const ev of stream) {
        if (ev.type === 'response.output_text.delta') {
          if (!produced) logTiming('ask.first_token', t0);
          produced += ev.delta;
          yield { type: 'token', text: ev.delta };
        } else if (ev.type === 'response.completed' || ev.type === 'response.incomplete') {
          final = ev.response;
        } else if (ev.type === 'response.failed') {
          throw new Error(ev.response.error?.message ?? 'response failed');
        } else if (ev.type === 'error') {
          throw new Error(ev.message);
        }
      }
      if (!final) throw new Error('stream ended without a response');
      const calls = final.output.filter((o) => o.type === 'function_call');
      if (!calls.length) break;
      const outs = await Promise.all(
        calls.map(async (c) => {
          const r = await runTool(c.name, c.arguments, ctx);
          results.set(r.name, r);
          if (r.ok) addSources(r);
          if (r.name === 'get_zone' || r.name === 'scan_zones') {
            const o = r.output as { id?: string; my_zone_id?: string };
            zoneId = o.id ?? o.my_zone_id ?? zoneId;
          }
          if (r.name === 'get_farm_alerts') alertId = (r.output as { alerts?: { id: string }[] }).alerts?.[0]?.id ?? alertId;
          return { type: 'function_call_output' as const, call_id: c.call_id, output: JSON.stringify(r.output).slice(0, 12_000) };
        }),
      );
      logTiming(`ask.tools.round${round + 1}`, t0, calls.map((c) => c.name).join(','));
      input = [...input, ...toResponseInputItems(final.output), ...outs];
      if (round === MAX_ROUNDS - 1 && !produced) throw new Error('no answer after tool rounds');
    }
    if (!produced.trim()) throw new Error('empty answer');
    sources.set('ai', { id: 'ai', name: 'AI (OpenAI)' });
  } catch (e) {
    if (opts.signal?.aborted) return;
    if (produced) {
      yield { type: 'error', code: 'ai_interrupted', message: serverT(lang, 'ask.notice.interrupted') };
    } else {
      const cap = e instanceof AiUnavailable && e.code === 'ai_cap';
      console.warn(`[atmos] ask fallback: ${errMsg(e).slice(0, 200)}`);
      yield { type: 'notice', text: serverT(lang, cap ? 'ask.notice.cap' : 'ask.notice.fallback') };
      // Fill the canned template with whatever live data we have.
      const extra = new Set<ToolName>(kind === 'heat' ? ['get_zone'] : kind === 'air' ? ['get_air'] : kind === 'farm' ? ['get_farm_alerts'] : []);
      for (const n of extra) {
        if (!results.has(n)) {
          const r = await runTool(n, {}, ctx);
          results.set(n, r);
          if (r.ok) addSources(r);
        }
      }
      const data: CannedData = { state: req.client_state };
      // Structured (non-rendered) data for the template, from the now-warm caches.
      const zid = (results.get('get_zone')?.output as { id?: string } | undefined)?.id ?? null;
      zoneId = zid ?? zoneId;
      if (kind === 'heat') {
        data.conditions = await getConditions(focus, lang).catch(() => null);
        data.zone = zid ? await getZoneDetail(zid, lang, { explain: false }).catch(() => null) : null;
      } else if (kind === 'air') data.air = await getAir(focus).catch(() => null);
      else if (kind === 'farm') data.farm = await farmAlertsOrSnapshot(focus, ctx.crop, ctx.stage, lang).catch(() => null);
      for (const c of chunks(cannedAnswer(kind, lang, data))) {
        yield { type: 'token', text: c };
        await sleep(18);
      }
    }
  }

  // 4) Sources, actions, done.
  yield { type: 'sources', sources: [...sources.values()] };
  for (const a of actionsFor(kind, { zoneId, alertId, screen: req.screen })) {
    yield { type: 'action', action: { ...a, label: typeof a.label === 'string' ? a.label : renderText(lang, a.label) } };
  }
  logTiming('ask.done', t0, `${produced.length} chars kind=${kind}`);
  yield { type: 'done', message_id: messageId, remaining_today: opts.remaining };
}

/** SSE wire format: `event: <type>\ndata: <JSON>\n\n`. */
export function sseEncode(e: AskEvent): string {
  return `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
}
