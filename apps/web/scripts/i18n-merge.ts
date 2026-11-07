/**
 * npm run i18n:merge -- <delta.json> [--dry]
 *
 * Applies a batch of message changes to every locale (replaces the V0 OpenAI translate script,
 * prompt-v1 §3.2: new strings are translated by the team, then merged here).
 *
 * delta.json: { "<namespace>": { "<dotted.key>": { "en": "…", "bn": "…", … } | null } }
 *   - a locale missing from an entry is left untouched in that file
 *   - null deletes the key in every locale
 * Human-translated locales (bn, ur): a key written here is listed in `_meta.machine_keys`, so a
 * native speaker can find and review it (prompt-v1 §8.4 "mark new machine strings").
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { HUMAN_LOCALES, LOCALES, META_KEY, type Json, type JsonObj } from './i18n-lib';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const DRY = argv.includes('--dry');
if (!file) {
  console.error('usage: npm run i18n:merge -- <delta.json> [--dry]');
  process.exit(2);
}

type Delta = Record<string, Record<string, Partial<Record<string, string | string[]>> | null>>;
const delta = JSON.parse(readFileSync(file, 'utf8')) as Delta;
const DIR = path.join(process.cwd(), 'src/i18n/messages');

function setPath(obj: JsonObj, key: string, value: Json | undefined): void {
  const parts = key.split('.');
  let cur: JsonObj = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof cur[p] !== 'object' || cur[p] === null || Array.isArray(cur[p])) {
      if (value === undefined) return;
      cur[p] = {};
    }
    cur = cur[p] as JsonObj;
  }
  const last = parts[parts.length - 1];
  if (value === undefined) delete cur[last];
  else cur[last] = value;
}

let changed = 0;
for (const [ns, entries] of Object.entries(delta)) {
  for (const locale of LOCALES) {
    const p = path.join(DIR, locale, `${ns}.json`);
    let data: JsonObj;
    try {
      data = JSON.parse(readFileSync(p, 'utf8')) as JsonObj;
    } catch {
      data = {};
    }
    let touched = false;
    const human = (HUMAN_LOCALES as readonly string[]).includes(locale);
    const meta = (data[META_KEY] as JsonObj | undefined) ?? undefined;
    const machineKeys = new Set<string>(Array.isArray(meta?.machine_keys) ? (meta.machine_keys as string[]) : []);
    for (const [key, byLocale] of Object.entries(entries)) {
      if (byLocale === null) {
        setPath(data, key, undefined);
        machineKeys.delete(key);
        touched = true;
        continue;
      }
      const v = byLocale[locale];
      if (v === undefined) continue;
      setPath(data, key, v as Json);
      if (human) machineKeys.add(key);
      touched = true;
    }
    if (!touched) continue;
    if (human && machineKeys.size) data[META_KEY] = { ...(meta ?? {}), machine_keys: [...machineKeys].sort() };
    else if (human && meta) {
      const rest = { ...meta };
      delete rest.machine_keys;
      if (Object.keys(rest).length) data[META_KEY] = rest;
      else delete data[META_KEY];
    }
    changed++;
    if (!DRY) writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
  }
}
console.log(`${DRY ? '[dry] ' : ''}updated ${changed} file(s)`);
