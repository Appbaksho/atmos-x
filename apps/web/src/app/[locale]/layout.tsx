/**
 * Root layout (the [locale] segment is the root, so <html lang dir> follows the locale).
 * Fonts, theme, i18n, query, prefs and location providers live here for every page.
 */
import type { Metadata, Viewport } from 'next';
import { hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { fontVariables } from '@/components/cz/fonts';
import { Providers } from '@/components/cz/shell/providers';
import { TIME_ZONE } from '@/i18n/fallback';
import { isRtl, routing } from '@/i18n/routing';

import '../globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: { default: 'Atmos X', template: '%s · Atmos X' },
  description: 'Find the hottest blocks around you and cool them down with trees, cool roofs and shade.',
  applicationName: 'Atmos X',
  appleWebApp: { capable: true, title: 'Atmos X', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F4F7' },
    { media: '(prefers-color-scheme: dark)', color: '#00182E' },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'} className={fontVariables} suppressHydrationWarning>
      <body>
        <Providers locale={locale} messages={messages} timeZone={TIME_ZONE}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
