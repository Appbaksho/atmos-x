import type { MetadataRoute } from 'next';

import { routing } from '@/i18n/routing';

const BASE = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
/** Public pages worth indexing. App screens behind sign-in are left out. */
const PAGES = ['', '/app', '/app/map', '/app/about', '/app/species', '/app/community', '/app/store'];

const url = (locale: string, path: string) => `${BASE}${locale === routing.defaultLocale ? '' : `/${locale}`}${path}` || '/';
const root = (u: string) => (u === BASE ? `${BASE}/` : u);

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({
    url: root(url(routing.defaultLocale, path)),
    changeFrequency: path ? 'daily' : 'weekly',
    priority: path ? 0.6 : 1,
    alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, root(url(l, path))])) },
  }));
}
