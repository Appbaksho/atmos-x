'use client';
/**
 * Root client providers (src/app/[locale]/layout.tsx):
 * ThemeProvider → NextIntlClientProvider → QueryClientProvider → PrefsProvider → LocationProvider,
 * plus the global AccountSheet, Toaster, RouterBridge and service-worker registration.
 */
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { ThemeProvider } from 'next-themes';
import React from 'react';

import { getMessageFallback, onIntlError } from '@/i18n/fallback';
import { LocationProvider } from '@/lib/location';
import { PrefsProvider } from '@/lib/prefs';
import { QueryProvider } from '@/lib/query';

import { AccountSheet } from '../account';
import { Toaster } from '../toast';
import { RouterBridge } from './router-bridge';
import { SwRegister } from './sw-register';

export function Providers({ locale, messages, timeZone, children }: { locale: string; messages: AbstractIntlMessages; timeZone: string; children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="atmos-theme" disableTransitionOnChange>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone} onError={onIntlError} getMessageFallback={getMessageFallback}>
        <QueryProvider>
          <PrefsProvider>
            <LocationProvider>
              <RouterBridge />
              {children}
              <AccountSheet />
              <Toaster />
              <SwRegister />
            </LocationProvider>
          </PrefsProvider>
        </QueryProvider>
      </NextIntlClientProvider>
    </ThemeProvider>
  );
}
