'use client';

import { useEffect, useSyncExternalStore } from 'react';

import {
  ensureDataContext,
  getDataContext,
  getServerDataContext,
  subscribeDataContext,
  type DataContext,
} from '../local/context';

/**
 * The current data context (namespace, me, lang, prefs). `ready` is false until prefs + session are
 * loaded on the client; hooks keep their queries disabled until then.
 */
export function useDataContext(): DataContext {
  const ctx = useSyncExternalStore(subscribeDataContext, getDataContext, getServerDataContext);
  useEffect(() => {
    void ensureDataContext();
  }, []);
  return ctx;
}

/** Presentation mode: cached-first (no background refetching of server data). */
export function cachePolicy(ctx: DataContext) {
  return ctx.presentation ? ({ staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false } as const) : ({} as const);
}
