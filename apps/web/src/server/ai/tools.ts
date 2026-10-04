import 'server-only';

import type { FunctionTool } from 'openai/resources/responses/responses';
import { z } from 'zod';

import { CROPS, STAGES } from '../farm/alerts';
import { farmAlertsOrSnapshot } from '../farm/alerts';
import { getAir } from '../air/air';
import { getZones } from '../heat/scan';
import { getZoneDetail } from '../heat/zone';
import { renderText } from '../i18n';
import { getNurseries } from '../places/nurseries';
import { getSpeciesList } from '../plan/species';
import { getConditions } from '../weather/conditions';
import type { CropId, I18nText, LatLng, Locale, Source, StageId } from '@/lib/data/types';

/**
 * Ask Atmos tools: each calls our own server modules in-process. Outputs are compacted (no hexes,
 * no long histories) and I18nText codes are rendered in the user's language so the model can quote them.
 */

export type ToolName = 'get_conditions' | 'scan_zones' | 'get_zone' | 'get_air' | 'get_farm_alerts' | 'find_nurseries' | 'get_species';

export type ToolCtx = { lang: Locale; focus: LatLng; zoneId?: string; crop: CropId; stage: StageId };

export type ToolResult = { name: ToolName; output: unknown; sources: Source[]; ok: boolean };

const nullableNum = { type: ['number', 'null'] } as const;
const latlngProps = {
  lat: { ...nullableNum, description: 'Latitude; null = the user’s focus location' },
  lng: { ...nullableNum, description: 'Longitude; null = the user’s focus location' },
};

const fn = (name: ToolName, description: string, properties: Record<string, unknown>): FunctionTool => ({
  type: 'function',
  name,
  description,
  strict: true,
  parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
});

export const TOOL_DEFS: FunctionTool[] = [
  fn('get_conditions', 'Weather now at a point: air and feels-like °C, humidity, heat risk, BMD-threshold heat-wave level (Bangladesh only, not official), normal max for the date and anomaly, 5-day forecast, active heat warnings.', latlngProps),
  fn('scan_zones', 'Scan hex heat zones (Heat Score 0–100, estimated surface °C from OpenStreetMap land cover + live air temperature) within a radius. Returns the ranked hottest zones and the user’s own zone.', {
    ...latlngProps,
    radius_m: { type: ['integer', 'null'], description: '100–1000 m; null = 500' },
  }),
  fn('get_zone', 'Details of one heat zone: drivers (sealed %, green %, building density), top causes, what-if +10 % green, 20-year hot-season air-temperature history.', {
    zone_id: { type: ['string', 'null'], description: 'Zone id like z-8a3c…-500; null = the zone on screen or the user’s own zone' },
  }),
  fn('get_air', 'Air quality now: PM2.5, US EPA AQI (computed), category, 5-day forecast, advice.', latlngProps),
  fn('get_farm_alerts', 'Farmer alerts for Bangladesh crops: haor flood, heat at flowering, drought, storm, cold wave, late blight, monsoon onset, lightning, field-worker heat.', {
    ...latlngProps,
    crop: { type: ['string', 'null'], enum: [...CROPS, null], description: 'null = the user’s crop' },
    stage: { type: ['string', 'null'], enum: [...STAGES, null], description: 'null = the user’s crop stage' },
  }),
  fn('find_nurseries', 'Nearby plant nurseries and garden centres (OpenStreetMap + curated Dhaka list) with distance.', latlngProps),
  fn('get_species', 'Recommended shade-tree species for the location (curated list in Bangladesh) with canopy, cooling, water need and sapling price.', latlngProps),
];

/** Replace every I18nText-shaped object with its rendered string. */
export function renderCodes(v: unknown, lang: Locale): unknown {
  if (Array.isArray(v)) return v.map((x) => renderCodes(x, lang));
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (typeof o.code === 'string' && keys.every((k) => k === 'code' || k === 'params') && o.code.includes('.')) return renderText(lang, o as I18nText);
    return Object.fromEntries(keys.map((k) => [k, renderCodes(o[k], lang)]));
  }
  return v;
}

const Args = z.object({
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  radius_m: z.number().int().min(100).max(1000).nullish(),
  zone_id: z.string().max(40).nullish(),
  crop: z.enum(CROPS as [CropId, ...CropId[]]).nullish(),
  stage: z.enum(STAGES as [StageId, ...StageId[]]).nullish(),
});

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`tool timed out after ${ms}ms`)), ms))]);
}

export async function runTool(name: string, rawArgs: string | Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
  const tool = name as ToolName;
  let args: z.infer<typeof Args>;
  try {
    args = Args.parse(typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs);
  } catch {
    args = {};
  }
  const p: LatLng = args.lat != null && args.lng != null ? { lat: args.lat, lng: args.lng } : ctx.focus;
  try {
    return await withTimeout(exec(tool, args, p, ctx), 20_000);
  } catch (e) {
    return { name: tool, ok: false, sources: [], output: { error: `data unavailable: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}` } };
  }
}

async function exec(tool: ToolName, args: z.infer<typeof Args>, p: LatLng, ctx: ToolCtx): Promise<ToolResult> {
  const { lang } = ctx;
  switch (tool) {
    case 'get_conditions': {
      const c = await getConditions(p, lang);
      const { meta, ...rest } = c;
      return { name: tool, ok: true, sources: meta.sources, output: { ...(renderCodes(rest, lang) as object), live: meta.live } };
    }
    case 'scan_zones': {
      const radius = args.radius_m ?? 500;
      const z = await getZones(p, radius, lang);
      return {
        name: tool,
        ok: true,
        sources: z.meta.sources,
        output: {
          method: z.scan.method,
          radius_m: z.scan.radius_m,
          scan_median_est_c: z.scan.baseline_lst_c,
          my_zone_id: z.my_zone_id,
          zones: z.zones.slice(0, 6).map(({ h3: _h3, ...zz }) => (void _h3, zz)),
          live: z.meta.live,
        },
      };
    }
    case 'get_zone': {
      const id = args.zone_id ?? ctx.zoneId ?? (await getZones(p, 500, lang)).my_zone_id;
      if (!id) return { name: tool, ok: false, sources: [], output: { error: 'no zone found here' } };
      const d = await getZoneDetail(id, lang, { explain: false });
      if (!d) return { name: tool, ok: false, sources: [], output: { error: 'zone not found' } };
      const { meta, h3: _h3, history, ...rest } = d;
      void _h3;
      const hist = history.filter((h) => h.day_lst_c != null);
      return {
        name: tool,
        ok: true,
        sources: meta.sources,
        output: {
          ...(renderCodes(rest, lang) as object),
          history_note: 'hot-season mean daily max air temperature (Open-Meteo archive)',
          history: hist.length ? [hist[0], hist[Math.floor(hist.length / 2)], hist[hist.length - 1]] : [],
          live: meta.live,
        },
      };
    }
    case 'get_air': {
      const a = await getAir(p);
      const { meta, my_sensors: _s, stations: _st, ...rest } = a;
      void _s;
      void _st;
      return { name: tool, ok: true, sources: meta.sources, output: { ...(renderCodes(rest, lang) as object), live: meta.live } };
    }
    case 'get_farm_alerts': {
      const r = await farmAlertsOrSnapshot(p, args.crop ?? ctx.crop, args.stage ?? ctx.stage, lang);
      return {
        name: tool,
        ok: true,
        sources: r.meta.sources,
        output: { crop: args.crop ?? ctx.crop, stage: args.stage ?? ctx.stage, region: r.region, alerts: renderCodes(r.alerts.map(({ sources: _x, ...a }) => (void _x, a)), lang), live: r.meta.live },
      };
    }
    case 'find_nurseries': {
      const n = await getNurseries(p, 10_000);
      return { name: tool, ok: true, sources: n.meta.sources, output: { nurseries: n.nurseries.slice(0, 6).map((x) => ({ id: x.id, name: x.name, dist_m: x.dist_m, hours: x.hours, phone: x.phone })), live: n.meta.live } };
    }
    case 'get_species': {
      const s = await getSpeciesList(p, lang);
      return { name: tool, ok: true, sources: s.meta.sources, output: { species: s.species.slice(0, 10).map(({ image_url: _i, ...x }) => (void _i, x)), live: s.meta.live } };
    }
    default:
      return { name: tool, ok: false, sources: [], output: { error: `unknown tool ${String(tool)}` } };
  }
}
