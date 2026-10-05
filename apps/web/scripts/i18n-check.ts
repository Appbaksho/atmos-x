/**
 * npm run i18n:check -- [--ns a,b] [--locales x,y] [--summary] [--strict]
 *
 * Every locale must have every key English has (src/i18n/messages/en/*.json, `_meta` ignored).
 * Lists the missing keys and exits 1 when any are missing. Also checks the ICU syntax of every
 * translated string (a syntax error fails the check, since the string can't render) and compares
 * placeholders / plural keywords / glossary terms with English (warnings; errors with --strict).
 */
import {
  compareMessages,
  flatten,
  icuSignature,
  LOCALES,
  listArg,
  NAMESPACES,
  pick,
  readMessages,
} from './i18n-lib';

const argv = process.argv.slice(2);
const namespaces = pick(listArg(argv, '--ns'), NAMESPACES, 'namespace');
const locales = pick(listArg(argv, '--locales'), LOCALES, 'locale').filter((l) => l !== 'en');
const SUMMARY = argv.includes('--summary');
const STRICT = argv.includes('--strict');

let missingTotal = 0;
let syntaxErrors = 0;
let mismatches = 0;
const lines: string[] = [];

for (const ns of namespaces) {
  const enLeaves = flatten(readMessages('en', ns));
  for (const [key, src] of enLeaves) {
    try {
      icuSignature(src);
    } catch (e) {
      syntaxErrors++;
      lines.push(`✗ en/${ns}:${key}: ICU syntax error: ${(e as Error).message}`);
    }
  }
}

for (const locale of locales) {
  for (const ns of namespaces) {
    const enLeaves = flatten(readMessages('en', ns));
    if (enLeaves.size === 0) continue;
    const leaves = flatten(readMessages(locale, ns));
    const missing = [...enLeaves.keys()].filter((k) => !leaves.has(k) || leaves.get(k)?.trim() === '');
    if (missing.length) {
      missingTotal += missing.length;
      lines.push(`✗ ${locale}/${ns}: ${missing.length} missing key(s)${SUMMARY ? '' : ':'}`);
      if (!SUMMARY) for (const k of missing) lines.push(`    ${k}`);
    }
    for (const [key, tr] of leaves) {
      const src = enLeaves.get(key);
      if (src === undefined) continue;
      const problems = compareMessages(src, tr, locale);
      if (!problems.length) continue;
      if (problems.some((p) => p.startsWith('ICU syntax error'))) syntaxErrors++;
      else mismatches++;
      if (!SUMMARY || problems.some((p) => p.startsWith('ICU syntax error')))
        lines.push(`${problems.some((p) => p.startsWith('ICU syntax error')) || STRICT ? '✗' : '⚠'} ${locale}/${ns}:${key}: ${problems.join('; ')}`);
    }
  }
}

for (const l of lines) console.log(l);
const scope = `${locales.length} locale(s) × ${namespaces.length} namespace(s)`;
const failed = missingTotal > 0 || syntaxErrors > 0 || (STRICT && mismatches > 0);
console.log(
  `\n${failed ? '✗' : '✓'} ${scope}: ${missingTotal} missing key(s), ${syntaxErrors} ICU syntax error(s), ${mismatches} placeholder/glossary warning(s)${STRICT ? '' : ' (not fatal; use --strict)'}.`,
);
process.exit(failed ? 1 : 0);
