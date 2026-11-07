import 'server-only';

import type { I18nText, Locale } from '@/lib/data/types';
import ar from '@/i18n/messages/ar/server.json';
import bn from '@/i18n/messages/bn/server.json';
import en from '@/i18n/messages/en/server.json';
import es from '@/i18n/messages/es/server.json';
import fr from '@/i18n/messages/fr/server.json';
import hi from '@/i18n/messages/hi/server.json';
import id from '@/i18n/messages/id/server.json';
import pt from '@/i18n/messages/pt/server.json';
import ur from '@/i18n/messages/ur/server.json';
import zh from '@/i18n/messages/zh/server.json';

/**
 * Server-side rendering of `server` namespace strings, for the few places where the server must
 * send finished text (Ask Atmos SSE warnings, canned answers). Everything else ships I18nText codes
 * that the client renders. Supports `{param}` substitution only; numbers use the locale's digits.
 */

type Tree = { [k: string]: Tree | string };
// All 10 locales (V0-8 machine-translated the other 7); `_meta` is never looked up as a code.
const MESSAGES: Record<Locale, Tree> = {
  en: en as Tree,
  bn: bn as unknown as Tree,
  ur: ur as unknown as Tree,
  hi: hi as unknown as Tree,
  ar: ar as unknown as Tree,
  es: es as unknown as Tree,
  fr: fr as unknown as Tree,
  pt: pt as unknown as Tree,
  id: id as unknown as Tree,
  zh: zh as unknown as Tree,
};

export const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-GB',
  bn: 'bn-BD',
  // Urdu digits (۰–۹), as the app's own formatter uses.
  ur: 'ur-PK-u-nu-arabext',
  hi: 'hi-IN',
  ar: 'ar-EG',
  es: 'es-ES',
  fr: 'fr-FR',
  pt: 'pt-BR',
  id: 'id-ID',
  zh: 'zh-CN',
};

export const LANG_NAME: Record<Locale, string> = {
  en: 'English',
  bn: 'Bangla (বাংলা, Bengali script)',
  ur: 'Urdu (اردو, Nastaliq/Arabic script)',
  hi: 'Hindi (हिन्दी, Devanagari script)',
  ar: 'Arabic (العربية)',
  es: 'Spanish',
  fr: 'French',
  pt: 'Portuguese',
  id: 'Indonesian',
  zh: 'Simplified Chinese',
};

function lookup(tree: Tree | undefined, code: string): string | null {
  let cur: Tree | string | undefined = tree;
  for (const part of code.split('.')) {
    if (cur == null || typeof cur === 'string') return null;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : null;
}

export function hasServerText(code: string): boolean {
  return lookup(MESSAGES.en, code) != null;
}

export function fmtNumber(n: number, lang: Locale, maxFrac = 1): string {
  return new Intl.NumberFormat(INTL_LOCALE[lang], { maximumFractionDigits: maxFrac }).format(n);
}

/** Render a server message in `lang` (falls back to English, then to the code). */
export function serverT(lang: Locale, code: string, params: Record<string, string | number> = {}): string {
  const msg = lookup(MESSAGES[lang], code) ?? lookup(MESSAGES.en, code) ?? code;
  return msg.replace(/\{(\w+)(?:,[^}]*)?\}/g, (_, k: string) => {
    const v = params[k];
    if (v == null) return '';
    return typeof v === 'number' ? fmtNumber(v, lang) : v;
  });
}

export function renderText(lang: Locale, t: I18nText | string): string {
  return typeof t === 'string' ? t : serverT(lang, t.code, t.params);
}

/** "Wed, 7 Oct" in the user's language for a YYYY-MM-DD date. */
export function dayLabel(date: string, lang: Locale): string {
  const d = new Date(date.slice(0, 10) + 'T12:00:00Z');
  try {
    return new Intl.DateTimeFormat(INTL_LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
  } catch {
    return date.slice(0, 10);
  }
}
