import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Landing } from '@/components/landing/landing';
import { routing } from '@/i18n/routing';
import type { SourcesInfo } from '@/lib/data/types';

const API_ORIGIN = (process.env.API_ORIGIN || 'http://localhost:8000').replace(/\/+$/, '');

/** Live list of data sources for the "NASA data in use" section; the page still renders without it. */
async function loadSources(): Promise<SourcesInfo | null> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/v1/sources`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) });
    return res.ok ? ((await res.json()) as SourcesInfo) : null;
  } catch {
    return null;
  }
}

/** Localised paths for hreflang: English has no prefix (`localePrefix: 'as-needed'`). */
function localePath(locale: string, path = ''): string {
  return locale === routing.defaultLocale ? path || '/' : `/${locale}${path}`;
}

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  const languages = Object.fromEntries(routing.locales.map((l) => [l, localePath(l)]));
  return {
    title: { absolute: t('metaTitle') },
    description: t('metaDescription'),
    alternates: { canonical: localePath(locale), languages: { ...languages, 'x-default': '/' } },
    openGraph: { title: t('metaTitle'), description: t('metaDescription'), type: 'website', locale, siteName: 'Atmos X', images: [{ url: '/icons/icon-512.png', width: 512, height: 512 }] },
  };
}

/** W1 · Landing page. */
export default async function LandingPage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Landing initial={await loadSources()} />;
}
