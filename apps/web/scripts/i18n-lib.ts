/**
 * Shared helpers for scripts/translate.ts and scripts/i18n-check.ts (V0-8).
 *
 * - Message files: src/i18n/messages/{locale}/{namespace}.json. Leaves are strings; arrays of
 *   strings are allowed (e.g. ask.sugg.*) and addressed per element ("sugg.heat.0").
 * - A top-level "_meta" object marks machine-written files ({"machine": true}); it is never a
 *   message and is stripped by the loader (src/i18n/messages.ts).
 * - A small ICU MessageFormat parser checks that translations keep every {placeholder}, the
 *   plural/select keywords and <tags> of the English source.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { NAMESPACES } from '@/i18n/messages';
import { LOCALES, type Locale } from '@/lib/data/types';

export { LOCALES, NAMESPACES };
export type { Locale };

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type JsonObj = { [k: string]: Json };

export const META_KEY = '_meta';
/** Fully machine-translated locales. Their files carry `_meta.machine = true`. */
export const MACHINE_LOCALES = ['hi', 'ar', 'es', 'fr', 'pt', 'id', 'zh'] as const satisfies readonly Locale[];
/** Human-translated locales: only missing keys are filled, existing strings are never touched. */
export const HUMAN_LOCALES = ['bn', 'ur'] as const satisfies readonly Locale[];
export const TARGET_LOCALES: readonly Locale[] = [...HUMAN_LOCALES, ...MACHINE_LOCALES];

/** Terms that must appear unchanged (Latin script) in every translation whose English has them. */
export const GLOSSARY = ['Atmos X', 'Heat Score', 'Ask Atmos', 'NASA', 'BMD', 'PM2.5', 'AQI', 'OpenStreetMap', 'Open-Meteo'] as const;
/** Kept as-is too, but not enforced by validation. */
export const SOFT_GLOSSARY = ['ERA5', 'DAE', 'OpenFreeMap', 'GIBS', 'MODIS', 'Landsat', 'POWER', 'H3', 'Google'] as const;

export const LANG_NAME: Record<Locale, string> = {
  en: 'English',
  bn: 'Bangla (বাংলা, Bengali script, Bangladesh)',
  ur: 'Urdu (اردو, Nastaliq/Arabic script, Pakistan)',
  hi: 'Hindi (हिन्दी, Devanagari script, India)',
  ar: 'Arabic (العربية, Modern Standard Arabic)',
  es: 'Spanish (neutral Latin American / international Spanish)',
  fr: 'French',
  pt: 'Portuguese (Brazilian)',
  id: 'Indonesian (Bahasa Indonesia)',
  zh: 'Simplified Chinese (简体中文)',
};

export const MESSAGES_DIR = path.join(process.cwd(), 'src/i18n/messages');
export const CACHE_FILE = path.join(process.cwd(), 'src/i18n/.translate-cache.json');

export function isObj(v: unknown): v is JsonObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function messageFile(locale: string, ns: string): string {
  return path.join(MESSAGES_DIR, locale, `${ns}.json`);
}

export function readMessages(locale: string, ns: string): JsonObj {
  const file = messageFile(locale, ns);
  if (!existsSync(file)) return {};
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return isObj(data) ? data : {};
}

export function formatJson(v: Json): string {
  return JSON.stringify(v, null, 2) + '\n';
}

// ---------------------------------------------------------------------------------------------
// Flattening

/** Every string leaf as "a.b.c" → text. Array elements use their index ("sugg.heat.0"). `_meta` is skipped. */
export function flatten(obj: Json, prefix = '', out = new Map<string, string>()): Map<string, string> {
  if (typeof obj === 'string') {
    out.set(prefix, obj);
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => flatten(v, prefix ? `${prefix}.${i}` : String(i), out));
  } else if (isObj(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      if (!prefix && k === META_KEY) continue;
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

export function getAt(obj: Json | undefined, key: string): Json | undefined {
  let cur: Json | undefined = obj;
  for (const seg of key.split('.')) {
    if (Array.isArray(cur)) cur = /^\d+$/.test(seg) ? cur[Number(seg)] : undefined;
    else if (isObj(cur)) cur = Object.hasOwn(cur, seg) ? cur[seg] : undefined;
    else return undefined;
  }
  return cur;
}

/**
 * Set a string leaf, creating missing containers with the same shape (object or array) as the
 * English template. Existing values on the way are kept; a non-container in the way is replaced.
 */
export function setAt(target: JsonObj, template: JsonObj, key: string, value: string): void {
  const segs = key.split('.');
  let cur: JsonObj | Json[] = target;
  let tpl: Json | undefined = template;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const last = i === segs.length - 1;
    const tplNext: Json | undefined = getAt(tpl, seg);
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (last) {
        cur[idx] = value;
        return;
      }
      if (typeof cur[idx] !== 'object' || cur[idx] === null) cur[idx] = Array.isArray(tplNext) ? [] : {};
      cur = cur[idx] as JsonObj | Json[];
    } else {
      if (last) {
        cur[seg] = value;
        return;
      }
      if (typeof cur[seg] !== 'object' || cur[seg] === null) cur[seg] = Array.isArray(tplNext) ? [] : {};
      cur = cur[seg] as JsonObj | Json[];
    }
    tpl = tplNext;
  }
}

/**
 * Rebuild `target` in the English key order, keeping only keys English has. An array is kept
 * only when every element is present (a partial array would shift indexes); otherwise English
 * shows through the loader's deep merge.
 */
export function rebuildLike(en: Json, target: Json | undefined): Json | undefined {
  if (typeof en === 'string') return typeof target === 'string' ? target : undefined;
  if (Array.isArray(en)) {
    if (!Array.isArray(target)) return undefined;
    const out: Json[] = [];
    for (let i = 0; i < en.length; i++) {
      const v = rebuildLike(en[i], target[i]);
      if (v === undefined) return undefined;
      out.push(v);
    }
    return out;
  }
  if (isObj(en)) {
    const out: JsonObj = {};
    for (const [k, v] of Object.entries(en)) {
      if (k === META_KEY) continue;
      const r = rebuildLike(v, isObj(target) ? target[k] : undefined);
      if (r === undefined) continue;
      if (isObj(r) && Object.keys(r).length === 0) continue;
      out[k] = r;
    }
    return out;
  }
  return en; // numbers / booleans / null are copied as-is
}

export function hashText(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Cache: per locale / namespace / key, the hash of the English text a machine translation was
// made from. A key without an entry was written by a human and is never overwritten.

export type TranslateCache = { version: 1; locales: Record<string, Record<string, Record<string, string>>> };

export function readCache(file = CACHE_FILE): TranslateCache {
  if (!existsSync(file)) return { version: 1, locales: {} };
  const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<TranslateCache>;
  return { version: 1, locales: data.locales ?? {} };
}

export function sortedCache(cache: TranslateCache): TranslateCache {
  const locales: TranslateCache['locales'] = {};
  for (const l of Object.keys(cache.locales).sort()) {
    locales[l] = {};
    for (const ns of Object.keys(cache.locales[l]).sort()) {
      const entries = Object.entries(cache.locales[l][ns]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      if (entries.length) locales[l][ns] = Object.fromEntries(entries);
    }
  }
  return { version: 1, locales };
}

export type KeyPlan = { todo: string[]; changed: string[]; human: number; upToDate: number };

/**
 * Which keys of one locale/namespace need a (re)translation:
 * - missing in the target file → translate
 * - present and recorded in the cache with a different English hash → English changed, re-translate
 * - present without a cache entry → human (or hand-fixed) text, keep
 * - `force`: also re-translate up-to-date machine strings (never human ones)
 */
export function planKeys(
  enLeaves: Map<string, string>,
  target: JsonObj,
  cached: Record<string, string> | undefined,
  force = false,
): KeyPlan {
  const plan: KeyPlan = { todo: [], changed: [], human: 0, upToDate: 0 };
  for (const [key, src] of enLeaves) {
    const cur = getAt(target, key);
    if (typeof cur !== 'string' || cur.trim() === '') {
      plan.todo.push(key);
      continue;
    }
    const h = cached?.[key];
    if (h === undefined) plan.human++;
    else if (h !== hashText(src)) {
      plan.todo.push(key);
      plan.changed.push(key);
    } else if (force) plan.todo.push(key);
    else plan.upToDate++;
  }
  return plan;
}

// ---------------------------------------------------------------------------------------------
// ICU MessageFormat signature

export class IcuError extends Error {}

export type IcuSig = {
  /** "name:kind" for every argument, kind = simple | plural | selectordinal | select | number | date | time | … */
  args: Set<string>;
  /** "name:kind" → selector keywords (union over occurrences) for plural / selectordinal / select. */
  options: Map<string, Set<string>>;
  /** Sorted list of tag tokens: "<b>", "</b>", "<br/>". */
  tags: string[];
};

const NAME_RE = /[A-Za-z0-9_]/;
const TAG_RE = /^<(\/?)([A-Za-z][\w-]*)\s*(\/?)>/;
const OPTION_KINDS = new Set(['plural', 'selectordinal', 'select']);

/**
 * Parse an ICU message (as intl-messageformat / next-intl does, with apostrophe quoting: `''` is a
 * literal apostrophe and `'{…}'` quotes syntax) and return its signature. Throws IcuError on
 * syntax errors such as unbalanced braces or a plural without `other`.
 */
export function icuSignature(msg: string): IcuSig {
  const sig: IcuSig = { args: new Set(), options: new Map(), tags: [] };
  let i = 0;
  const n = msg.length;

  const ws = () => {
    while (i < n && /\s/.test(msg[i])) i++;
  };
  const word = (re: RegExp) => {
    const start = i;
    while (i < n && re.test(msg[i])) i++;
    return msg.slice(start, i);
  };

  function message(depth: number, inPlural: boolean): void {
    while (i < n) {
      const c = msg[i];
      if (c === "'") {
        const next = msg[i + 1];
        if (next === "'") {
          i += 2;
        } else if (next === '{' || next === '}' || (inPlural && next === '#') || next === '<') {
          i++;
          while (i < n) {
            if (msg[i] === "'") {
              if (msg[i + 1] === "'") {
                i += 2;
                continue;
              }
              i++;
              break;
            }
            i++;
          }
        } else i++;
        continue;
      }
      if (c === '{') {
        i++;
        argument(depth, inPlural);
        continue;
      }
      if (c === '}') {
        if (depth > 0) return;
        throw new IcuError(`unexpected "}" at ${i}`);
      }
      if (c === '<') {
        const m = TAG_RE.exec(msg.slice(i));
        if (m) {
          sig.tags.push(m[1] ? `</${m[2]}>` : m[3] ? `<${m[2]}/>` : `<${m[2]}>`);
          i += m[0].length;
          continue;
        }
      }
      i++;
    }
    if (depth > 0) throw new IcuError('unclosed "{"');
  }

  function argument(depth: number, inPlural: boolean): void {
    ws();
    const name = word(NAME_RE);
    if (!name) throw new IcuError(`bad argument name at ${i}`);
    ws();
    if (msg[i] === '}') {
      sig.args.add(`${name}:simple`);
      i++;
      return;
    }
    if (msg[i] !== ',') throw new IcuError(`expected "," or "}" after {${name} at ${i}`);
    i++;
    ws();
    const kind = word(/[a-z]/);
    if (!kind) throw new IcuError(`missing argument type for {${name}}`);
    sig.args.add(`${name}:${kind}`);
    ws();
    if (msg[i] === '}') {
      if (OPTION_KINDS.has(kind)) throw new IcuError(`{${name}, ${kind}} has no options`);
      i++;
      return;
    }
    if (msg[i] !== ',') throw new IcuError(`expected "," after {${name}, ${kind} at ${i}`);
    i++;
    if (!OPTION_KINDS.has(kind)) {
      // number / date / time style: skip to the matching brace.
      let d = 0;
      while (i < n) {
        if (msg[i] === '{') d++;
        else if (msg[i] === '}') {
          if (d === 0) break;
          d--;
        }
        i++;
      }
      if (msg[i] !== '}') throw new IcuError(`unclosed {${name}, ${kind}, …}`);
      i++;
      return;
    }
    const sigKey = `${name}:${kind}`;
    const opts = sig.options.get(sigKey) ?? new Set<string>();
    sig.options.set(sigKey, opts);
    const seen = new Set<string>();
    for (;;) {
      ws();
      if (i >= n) throw new IcuError(`unclosed {${name}, ${kind}}`);
      if (msg[i] === '}') {
        i++;
        break;
      }
      const sel = word(/[^\s{}]/);
      if (!sel) throw new IcuError(`bad selector in {${name}, ${kind}} at ${i}`);
      if (kind !== 'select' && sel.startsWith('offset:')) continue;
      ws();
      if (msg[i] !== '{') throw new IcuError(`expected "{" after selector "${sel}" in {${name}}`);
      i++;
      message(depth + 1, kind !== 'select' ? true : inPlural);
      if (msg[i] !== '}') throw new IcuError(`unclosed branch "${sel}" in {${name}}`);
      i++;
      if (seen.has(sel)) throw new IcuError(`duplicate selector "${sel}" in {${name}}`);
      seen.add(sel);
      opts.add(sel);
    }
    if (!seen.has('other')) throw new IcuError(`{${name}, ${kind}} has no "other" branch`);
  }

  message(0, false);
  sig.tags.sort();
  return sig;
}

function pluralCategories(locale: string, kind: string): Set<string> {
  try {
    return new Set(new Intl.PluralRules(locale, { type: kind === 'selectordinal' ? 'ordinal' : 'cardinal' }).resolvedOptions().pluralCategories);
  } catch {
    return new Set(['other']);
  }
}

const diff = (a: Iterable<string>, b: Set<string>) => [...a].filter((x) => !b.has(x));

/**
 * Problems with `tr` as a translation of `en` into `locale` (empty = OK):
 * - ICU syntax must parse;
 * - the same argument names and types ({n}, {n, plural}, …);
 * - select options identical; plural `=N` options identical, and plural categories may differ
 *   only as the target language's CLDR rules require (e.g. Arabic may add two/few/many, Chinese
 *   may drop `one`), with `other` always present;
 * - the same <tags>;
 * - every GLOSSARY term of the English is present verbatim.
 */
export function compareMessages(en: string, tr: string, locale: string): string[] {
  let a: IcuSig;
  try {
    a = icuSignature(en);
  } catch {
    return []; // the English itself is not ICU-valid; nothing to compare against
  }
  let b: IcuSig;
  try {
    b = icuSignature(tr);
  } catch (e) {
    return [`ICU syntax error: ${(e as Error).message}`];
  }
  const problems: string[] = [];
  const missing = diff(a.args, b.args);
  const extra = diff(b.args, a.args);
  if (missing.length) problems.push(`missing placeholder(s) ${missing.map((x) => `{${x.replace(':simple', '').replace(':', ', ')}}`).join(' ')}`);
  if (extra.length) problems.push(`unexpected placeholder(s) ${extra.map((x) => `{${x.replace(':simple', '').replace(':', ', ')}}`).join(' ')}`);
  for (const [key, enOpts] of a.options) {
    const trOpts = b.options.get(key);
    if (!trOpts) continue; // already reported as a missing argument
    const [name, kind] = key.split(':');
    if (kind === 'select') {
      if (diff(enOpts, trOpts).length || diff(trOpts, enOpts).length)
        problems.push(`{${name}, select} options must be exactly: ${[...enOpts].join(', ')}`);
      continue;
    }
    const cats = pluralCategories(locale, kind);
    const enExplicit = [...enOpts].filter((o) => o.startsWith('='));
    const trExplicit = [...trOpts].filter((o) => o.startsWith('='));
    const allowed = new Set([...enOpts, ...cats]);
    const required = [...enOpts].filter((o) => !o.startsWith('=') && cats.has(o));
    const badExplicit = diff(enExplicit, new Set(trExplicit)).length > 0 || diff(trExplicit, new Set(enExplicit)).length > 0;
    const notAllowed = [...trOpts].filter((o) => !o.startsWith('=') && !allowed.has(o));
    const lost = diff(required, trOpts);
    if (badExplicit || notAllowed.length || lost.length)
      problems.push(`{${name}, ${kind}} keywords must be ${[...enOpts].join(', ')} (this language may also use: ${[...cats].join(', ')})`);
  }
  if (a.tags.join() !== b.tags.join()) problems.push(`tags must be exactly ${a.tags.join(' ') || '(none)'}`);
  for (const term of GLOSSARY) if (en.includes(term) && !tr.includes(term)) problems.push(`keep "${term}" untranslated`);
  return problems;
}

// ---------------------------------------------------------------------------------------------
// CLI helpers

export function listArg(argv: string[], name: string): string[] | null {
  const i = argv.indexOf(name);
  let raw: string | undefined;
  if (i >= 0) raw = argv[i + 1];
  else raw = argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
  if (raw === undefined) return null;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function numArg(argv: string[], name: string, fallback: number): number {
  const v = listArg(argv, name)?.[0];
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Validate --ns / --locales filters against known values; exits on a typo. */
export function pick<T extends string>(requested: string[] | null, all: readonly T[], what: string): T[] {
  if (!requested) return [...all];
  const bad = requested.filter((r) => !(all as readonly string[]).includes(r));
  if (bad.length) {
    console.error(`Unknown ${what}: ${bad.join(', ')}. Known: ${all.join(', ')}`);
    process.exit(2);
  }
  return requested as T[];
}
