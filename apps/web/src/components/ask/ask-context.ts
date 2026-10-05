'use client';
/**
 * Screen → Ask Atmos context (V0-7). A screen can tell the panel what it shows, so answers use the
 * same numbers (prompt-v0 §5.2 `client_state.visible`) and the right ids (`context`):
 *
 *   import { useAskContext } from '@/components/ask/ask-context';
 *   useAskContext({ context: { zone_id: zone.id }, visible: { zone: zone.name, score: zone.score } });
 *
 * The latest mounted screen wins; it is cleared on unmount. Without it, the panel still derives
 * the ids from the route (zone / tree / field) and the focus point.
 */
import { useEffect, useSyncExternalStore } from 'react';

import type { AskContext } from '@/lib/data/types';

export type AskScreenContext = { context?: AskContext; visible?: Record<string, unknown>; place?: string };

let current: AskScreenContext | null = null;
const subs = new Set<() => void>();

function set(v: AskScreenContext | null) {
  current = v;
  subs.forEach((f) => f());
}

function subscribe(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

/** Publish what the current screen shows to Ask Atmos (cleared on unmount). */
export function useAskContext(v: AskScreenContext | null) {
  const key = JSON.stringify(v ?? null);
  useEffect(() => {
    const parsed = JSON.parse(key) as AskScreenContext | null;
    set(parsed);
    return () => {
      if (current && JSON.stringify(current) === key) set(null);
    };
  }, [key]);
}

/** Read by the panel. */
export function useAskScreenContext(): AskScreenContext | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
