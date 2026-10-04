/**
 * Message loading: src/i18n/messages/{locale}/{namespace}.json, merged under namespace keys.
 * Every locale is deep-merged over English, so a key missing in `bn` shows the English string.
 */
import type { Locale } from '@/lib/data/types';

export const NAMESPACES = [
  'common',
  'nav',
  'onboarding',
  'home',
  'map',
  'zone',
  'plan',
  'act',
  'community',
  'profile',
  'air',
  'farm',
  'ask',
  'auth',
  'landing',
  'server',
] as const;
export type Namespace = (typeof NAMESPACES)[number];

type Json = { [k: string]: Json | string | number | boolean | null | Json[] };
export type Messages = Record<string, Json>;

async function loadNamespace(locale: string, ns: string): Promise<Json> {
  try {
    const mod = (await import(`./messages/${locale}/${ns}.json`)) as { default: Json };
    // `_meta` ({"machine": true} in machine-translated files, V0-8) is not a message.
    const data: Json = { ...(mod.default ?? {}) };
    delete data._meta;
    return data;
  } catch {
    // Missing file (e.g. server.json before V0-2 lands): treat as empty.
    return {};
  }
}

async function loadLocale(locale: string): Promise<Messages> {
  const entries = await Promise.all(NAMESPACES.map(async (ns) => [ns, await loadNamespace(locale, ns)] as const));
  return Object.fromEntries(entries);
}

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function deepMerge(base: Json, over: Json): Json {
  const out: Json = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = isObj(b) && isObj(v) ? deepMerge(b, v) : v;
  }
  return out;
}

/** All namespaces for `locale`, with English filling every missing key. */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const en = await loadLocale('en');
  if (locale === 'en') return en;
  return deepMerge(en, await loadLocale(locale)) as Messages;
}
