/**
 * npm run i18n:translate -- [--ns a,b] [--locales x,y] [--dry-run] [--force] [--effort low|medium|high]
 *                            [--batch-chars 6000] [--concurrency 6] [--model name]
 *
 * --force re-translates machine strings that are up to date (human bn/ur strings are still kept).
 *
 * Machine translation of the UI messages (prompt-v0.md V0-8). English (src/i18n/messages/en) is
 * the source. For hi, ar, es, fr, pt, id, zh the whole file is machine-written and marked
 * `"_meta": {"machine": true}`; for bn and ur only keys missing from the human file are filled.
 *
 * Only missing keys, and keys whose English changed since they were machine-translated, are sent:
 * src/i18n/.translate-cache.json keeps the hash of the English text behind every machine string.
 * A key present in a file without a cache entry is human text and is never overwritten.
 *
 * Each batch goes to OPENAI_MODEL_CHEAP (Responses API, strict JSON schema with exactly the batch
 * keys). Every result is checked with the ICU validator (placeholders, plural/select keywords,
 * tags, glossary terms); failing keys are retried with the problems listed, and keys that still
 * fail are left out (English shows through) and reported. Exit code 1 if anything is left out.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import OpenAI from 'openai';

import {
  CACHE_FILE,
  compareMessages,
  flatten,
  formatJson,
  getAt,
  GLOSSARY,
  hashText,
  HUMAN_LOCALES,
  isObj,
  LANG_NAME,
  listArg,
  type Locale,
  messageFile,
  META_KEY,
  NAMESPACES,
  numArg,
  pick,
  planKeys,
  readCache,
  readMessages,
  rebuildLike,
  setAt,
  SOFT_GLOSSARY,
  sortedCache,
  TARGET_LOCALES,
  type JsonObj,
} from './i18n-lib';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const FORCE = argv.includes('--force');
const EFFORT = (listArg(argv, '--effort')?.[0] ?? 'medium') as 'low' | 'medium' | 'high';
const namespaces = pick(listArg(argv, '--ns'), NAMESPACES, 'namespace');
const locales = pick(listArg(argv, '--locales'), TARGET_LOCALES, 'locale');
const BATCH_CHARS = numArg(argv, '--batch-chars', 6000);
const CONCURRENCY = numArg(argv, '--concurrency', 6);
const MAX_ATTEMPTS = 3;
const MODEL = listArg(argv, '--model')?.[0] ?? process.env.OPENAI_MODEL_CHEAP ?? 'gpt-5.4-mini';

const isHuman = (l: Locale) => (HUMAN_LOCALES as readonly string[]).includes(l);

/** Register and digits per language (apps address the user the way local apps usually do). */
const STYLE: Partial<Record<Locale, string>> = {
  bn: 'Use আপনি (polite). Write literal numbers in Bengali digits (০-৯), like the existing Bangla copy.',
  ur: 'Use آپ (polite). Write literal numbers in Urdu digits (۰-۹), like the existing Urdu copy.',
  hi: 'Use आप (polite), everyday Hindi (not heavy Sanskritised words); common English loanwords are fine where Hindi apps use them. Keep Western digits.',
  ar: 'Use Modern Standard Arabic, simple and direct, addressing the user in the masculine singular imperative as Arabic apps do. Keep Western digits (0-9).',
  es: 'Address the user as "tú". Neutral Spanish that works in Latin America and Spain.',
  fr: 'Address the user as "vous". Use French typography (non-breaking space before : ; ? ! is optional; keep it simple).',
  pt: 'Brazilian Portuguese, address the user as "você".',
  id: 'Use "Anda" and clear, standard Bahasa Indonesia.',
  zh: 'Simplified Chinese as used in mainland apps, address the user as 你. Use full-width Chinese punctuation (，。：？！) in sentences.',
};

function instructions(locale: Locale): string {
  const cats = new Intl.PluralRules(locale).resolvedOptions().pluralCategories.join(', ');
  return `You translate user-interface text for Atmos X, a mobile web app that helps people in hot cities (starting with Dhaka, Bangladesh) cool their neighbourhood: a heat map, tree planting and cool roofs, a cooling plan with costs, teams and points, tree care, air quality (PM2.5 / AQI), weather alerts for farmers, and an AI helper called Ask Atmos.

Translate every value from English into ${LANG_NAME[locale]}.

Tone: short, plain and friendly, with public-safety clarity (heat, air and flood warnings must be unambiguous). Everyday words a non-expert understands, no slang. Buttons, tabs, chips and labels have little room: keep them about as short as the English. ${STYLE[locale] ?? ''}

Rules:
1. Keep these terms exactly as written, in Latin letters; never translate or transliterate them: ${GLOSSARY.join(', ')}. Also keep ${SOFT_GLOSSARY.join(', ')} as-is.
2. The texts are ICU MessageFormat. Copy every {placeholder} exactly (never translate the name inside the braces). In {x, plural, …}, {x, selectordinal, …} and {x, select, …} keep the argument name, the word plural/select and the option keywords (one, other, =0, max …) exactly; translate only the text inside each branch and keep # and nested {placeholders} there. For plurals, this language's categories are: ${cats}. Always keep "other"; you may add categories this language needs or drop ones it never uses. Keep <tag>…</tag> markup.
3. Never use the ASCII apostrophe (') — it is an escape character in ICU. Use ’ instead.
4. Keep emoji, symbols and units (°C, °F, m², km, %, ৳, ×, ·, …, →, ✓) and line breaks (\\n). Keep the same sentence count; don't add explanations.
5. Keep the meaning and role of every placeholder: "{n} of {max}" means n out of a maximum of max; "{name}" is a person, place or tree name; numbers arrive already formatted. Word order may change, the roles may not.
6. The key tells you where the text is shown (e.g. "nav.home" is a tab label, "*.title" a heading, "*.sub" a subtitle, "server.*" text the app puts on data cards, "ask.screen.*" screen names). Translate the meaning naturally, not word for word.

Return a JSON object with exactly the same keys as the input, each value being the translation of that key's English text.`;
}

/** Context for keys whose English is ambiguous ("namespace.key" → note shown to the model). */
const NOTES: Record<string, string> = {
  'ask.limit':
    '{n} = messages used today, {max} = the daily limit: "n used out of max". Translate the word "of" too, using the natural "n out of max" order of the language (Hindi: "{max} में से {n}", Bangla: "{max}টির মধ্যে {n}টি").',
  'ask.limitGuest':
    '{n} = guest messages used today, {max} = the daily guest limit: "n used out of max". Translate the word "of" too, using the natural "n out of max" order of the language (Hindi: "{max} में से {n}").',
};

type Item = { key: string; src: string };
type Job = { locale: Locale; ns: string; items: Item[] };
type Usage = { input: number; output: number; calls: number };

const usage: Usage = { input: 0, output: 0, calls: 0 };
const failures: string[] = [];

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set (put it in apps/web/.env.local). Use --dry-run to see what would be translated.');
      process.exit(2);
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 3, timeout: 180_000 });
  }
  return client;
}

async function callModel(locale: Locale, ns: string, items: Item[], feedback: Map<string, string[]>): Promise<Record<string, string>> {
  // Keys are sent with their namespace ("nav.home") so the model knows where the text is shown.
  const full = (key: string) => `${ns}.${key}`;
  const keys = items.map((it) => full(it.key));
  const schema = {
    type: 'object',
    properties: Object.fromEntries(keys.map((k) => [k, { type: 'string' }])),
    required: keys,
    additionalProperties: false,
  };
  let input = JSON.stringify(Object.fromEntries(items.map((it) => [full(it.key), it.src])), null, 1);
  const notes = items.flatMap((it) => (NOTES[full(it.key)] ? [`- ${full(it.key)}: ${NOTES[full(it.key)]}`] : []));
  if (notes.length) input += `\n\nNotes on some keys:\n${notes.join('\n')}`;
  if (feedback.size) {
    const fixes = [...feedback].map(([k, p]) => `- ${full(k)}: ${p.join('; ')}`).join('\n');
    input += `\n\nYour previous translation of these keys was rejected; fix exactly these problems:\n${fixes}`;
  }
  const chars = items.reduce((sum, it) => sum + it.src.length, 0);
  const res = await openai().responses.create({
    model: MODEL,
    instructions: instructions(locale),
    input,
    reasoning: { effort: EFFORT },
    max_output_tokens: Math.min(64_000, 6_000 + Math.ceil(chars * 2.5)),
    store: false,
    text: { format: { type: 'json_schema', name: 'translations', schema, strict: true } },
  });
  usage.calls++;
  usage.input += res.usage?.input_tokens ?? 0;
  usage.output += res.usage?.output_tokens ?? 0;
  if (res.status === 'incomplete') throw new Error(`incomplete response (${res.incomplete_details?.reason ?? 'unknown'})`);
  const parsed: unknown = JSON.parse(res.output_text);
  if (!isObj(parsed)) throw new Error('response is not a JSON object');
  const out: Record<string, string> = {};
  for (const it of items) {
    const v = parsed[full(it.key)];
    if (typeof v === 'string') out[it.key] = v;
  }
  return out;
}

/** Normalise a model string: ASCII apostrophes → ’ (ICU-safe), trim stray outer whitespace like the source. */
function clean(src: string, tr: string): string {
  let s = tr.replace(/'/g, '’');
  if (src === src.trim()) s = s.trim();
  return s;
}

/** Translate one batch with validation and targeted retries. Returns the accepted translations. */
async function translateBatch(job: Job): Promise<Map<string, string>> {
  const accepted = new Map<string, string>();
  let pending = job.items;
  let feedback = new Map<string, string[]>();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && pending.length; attempt++) {
    let result: Record<string, string>;
    try {
      result = await callModel(job.locale, job.ns, pending, feedback);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`  ! ${job.locale}/${job.ns}: attempt ${attempt} failed: ${msg.slice(0, 200)}`);
      if (pending.length > 1 && /incomplete|max_output_tokens/i.test(msg)) {
        // Too long: split the batch and translate the halves separately.
        const mid = Math.ceil(pending.length / 2);
        const [a, b] = await Promise.all([
          translateBatch({ ...job, items: pending.slice(0, mid) }),
          translateBatch({ ...job, items: pending.slice(mid) }),
        ]);
        for (const [k, v] of [...a, ...b]) accepted.set(k, v);
        return accepted;
      }
      continue;
    }
    const next: Item[] = [];
    feedback = new Map();
    for (const it of pending) {
      const raw = result[it.key];
      const tr = raw === undefined ? '' : clean(it.src, raw);
      const problems = tr ? compareMessages(it.src, tr, job.locale) : ['empty translation'];
      if (problems.length === 0) accepted.set(it.key, tr);
      else {
        next.push(it);
        feedback.set(it.key, problems);
      }
    }
    if (next.length) console.warn(`  ~ ${job.locale}/${job.ns}: ${next.length} key(s) failed validation on attempt ${attempt}, retrying`);
    pending = next;
  }
  for (const it of pending) failures.push(`${job.locale}/${job.ns}:${it.key}${feedback.get(it.key) ? ` (${feedback.get(it.key)?.join('; ')})` : ''}`);
  return accepted;
}

function batches(items: Item[]): Item[][] {
  const out: Item[][] = [];
  let cur: Item[] = [];
  let size = 0;
  for (const it of items) {
    const len = it.src.length + it.key.length + 8;
    if (cur.length && (size + len > BATCH_CHARS || cur.length >= 150)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(it);
    size += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function pool<T>(tasks: (() => Promise<T>)[], n: number): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, tasks.length) }, async () => {
      while (next < tasks.length) await tasks[next++]();
    }),
  );
}

// Serialised file writes (jobs finish concurrently).
let writeChain: Promise<void> = Promise.resolve();
function queueWrite(file: string, content: () => string): Promise<void> {
  writeChain = writeChain.then(async () => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content());
  });
  return writeChain;
}

function render(locale: Locale, en: JsonObj, target: JsonObj): string {
  if (isHuman(locale)) {
    const out: JsonObj = { ...target };
    delete out[META_KEY];
    return formatJson(out);
  }
  const body = (rebuildLike(en, target) ?? {}) as JsonObj;
  return formatJson({ [META_KEY]: { machine: true }, ...body });
}

async function main() {
  const cache = readCache();
  const state = new Map<string, { en: JsonObj; target: JsonObj }>();
  const jobs: Job[] = [];
  let totalKeys = 0;
  let totalChars = 0;

  for (const locale of locales) {
    for (const ns of namespaces) {
      const en = readMessages('en', ns);
      const enLeaves = flatten(en);
      if (enLeaves.size === 0) continue;
      const target = readMessages(locale, ns);
      const cached = cache.locales[locale]?.[ns];
      const plan = planKeys(enLeaves, target, cached, FORCE);
      // Drop cache entries for keys English no longer has, or that a human has since taken over.
      if (cached) for (const k of Object.keys(cached)) if (!enLeaves.has(k) || typeof getAt(target, k) !== 'string') delete cached[k];
      state.set(`${locale}/${ns}`, { en, target });
      const items = plan.todo.map((key) => ({ key, src: enLeaves.get(key) as string }));
      const chars = items.reduce((s, it) => s + it.src.length, 0);
      totalKeys += items.length;
      totalChars += chars;
      const human = isHuman(locale) ? `, ${plan.human} human kept` : plan.human ? `, ${plan.human} hand-edited kept` : '';
      console.log(
        `${locale}/${ns}: ${items.length} to translate (${plan.changed.length} changed in English, ${chars} chars)${human}, ${plan.upToDate} up to date`,
      );
      for (const b of batches(items)) jobs.push({ locale, ns, items: b });
    }
  }
  console.log(`\n${totalKeys} keys, ${totalChars} English chars, ${jobs.length} batch(es), model ${MODEL}.`);
  if (DRY || jobs.length === 0) {
    if (!DRY) {
      // Nothing to translate, but still normalise machine files (key order, _meta, pruning).
      for (const [id, { en, target }] of state) {
        const [locale, ns] = id.split('/') as [Locale, string];
        if (!isHuman(locale)) await queueWrite(messageFile(locale, ns), () => render(locale, en, target));
      }
      await queueWrite(CACHE_FILE, () => JSON.stringify(sortedCache(cache), null, 1) + '\n');
    }
    return;
  }

  const t0 = Date.now();
  let done = 0;
  await pool(
    jobs.map((job) => async () => {
      const got = await translateBatch(job);
      const st = state.get(`${job.locale}/${job.ns}`);
      if (!st) return;
      const nsCache = ((cache.locales[job.locale] ??= {})[job.ns] ??= {});
      for (const [key, tr] of got) {
        setAt(st.target, st.en, key, tr);
        nsCache[key] = hashText(job.items.find((it) => it.key === key)?.src ?? '');
      }
      done++;
      console.log(`[${done}/${jobs.length}] ${job.locale}/${job.ns}: ${got.size}/${job.items.length} keys`);
      await queueWrite(messageFile(job.locale, job.ns), () => render(job.locale, st.en, st.target));
      await queueWrite(CACHE_FILE, () => JSON.stringify(sortedCache(cache), null, 1) + '\n');
    }),
    CONCURRENCY,
  );
  // Machine files with nothing to translate still get normalised (order, _meta, pruned keys).
  for (const [id, { en, target }] of state) {
    const [locale, ns] = id.split('/') as [Locale, string];
    if (!isHuman(locale)) await queueWrite(messageFile(locale, ns), () => render(locale, en, target));
  }
  await writeChain;

  console.log(
    `\nDone in ${Math.round((Date.now() - t0) / 1000)} s: ${usage.calls} API call(s), ${usage.input} input + ${usage.output} output tokens (${MODEL}).`,
  );
  if (failures.length) {
    console.error(`\n${failures.length} key(s) could not be translated (English shows through):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
