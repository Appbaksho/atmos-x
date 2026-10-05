'use client';
/**
 * TanStack Query client: staleTime 5 min, 1 retry (none for 4xx / guest / rate-limit errors).
 * Global error mapping:
 *  - GuestRestrictedError → requireAccount() sheet (queries can opt out with meta: { silentGuest: true })
 *  - RateLimitedError → "Daily limit reached" toast
 */
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import React, { useEffect, useState } from 'react';

import { requireAccount } from '@/components/cz/account';
import { toast } from '@/components/cz/toast';
import { DataError, isGuestRestricted, RateLimitedError } from '@/lib/data/errors';
import { getDataContext, subscribeDataContext } from '@/lib/data/local/context';

export function makeQueryClient(handlers: { onGuest: () => void; onRateLimited: () => void }) {
  const handle = (error: unknown, meta?: Record<string, unknown>) => {
    if (isGuestRestricted(error)) {
      if (meta?.silentGuest !== true) handlers.onGuest();
    } else if (error instanceof RateLimitedError) handlers.onRateLimited();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: (e, q) => handle(e, q.meta) }),
    mutationCache: new MutationCache({ onError: (e, _v, _c, m) => handle(e, m.meta) }),
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: (count, e) => {
          if (e instanceof DataError && e.status >= 400 && e.status < 500) return false;
          return count < 1;
        },
      },
      mutations: { retry: false },
    },
  });
}

/** Translated toast text, refreshed from the current locale (read only in event callbacks). */
let limitText = 'Daily limit reached. Try again later.';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common');
  useEffect(() => {
    limitText = t('limitReached');
  }, [t]);
  const [client] = useState(() =>
    makeQueryClient({
      onGuest: () => requireAccount(),
      onRateLimited: () => toast(limitText, { tone: 'warn' }),
    }),
  );
  // When the data context switches (guest → account → Presentation mode), local data moves to another
  // namespace and may finish seeding after the first reads: refetch everything once it settles.
  useEffect(() => {
    let last = getDataContext();
    return subscribeDataContext(() => {
      const next = getDataContext();
      if (next.ready && (next.ns !== last.ns || next.ready !== last.ready)) void client.invalidateQueries();
      last = next;
    });
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
