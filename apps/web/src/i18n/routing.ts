import { defineRouting } from 'next-intl/routing';

import { LOCALES, RTL_LOCALES, type Locale } from '@/lib/data/types';

/**
 * 10 locales, English without a prefix (`/app`), others prefixed (`/bn/app`).
 * The proxy (src/proxy.ts) runs this routing for pages only, never for /api, /_next or static files.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: 'en',
  localePrefix: 'as-needed',
});

export function isRtl(locale: string): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale);
}

/** Native names for the language picker (S02, Settings). */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  bn: 'বাংলা',
  ur: 'اردو',
  hi: 'हिन्दी',
  ar: 'العربية',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  id: 'Bahasa Indonesia',
  zh: '中文',
};
