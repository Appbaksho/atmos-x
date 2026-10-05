/** Shared fixtures for the data-layer unit tests (memory KV, contexts). Not used by the app. */
import { DEFAULT_PREFS } from '@/lib/prefs-store';

import type { DataContext } from './context';
import { memoryKV, setKV } from './kv';

export function freshStore(): void {
  setKV(memoryKV());
}

export function userCtx(over: Partial<DataContext> = {}): DataContext {
  return {
    ready: true,
    ns: 'user:p-test',
    kind: 'user',
    userId: 'p-test',
    displayName: 'Test User',
    email: 'test@example.com',
    createdAt: null,
    presentation: false,
    lang: 'en',
    prefs: DEFAULT_PREFS,
    ...over,
  };
}

export function guestCtx(): DataContext {
  return userCtx({ ns: 'guest', kind: 'guest', userId: 'guest', displayName: '', email: null });
}

export function demoCtx(): DataContext {
  return userCtx({ ns: 'demo', userId: 'u-nadia', displayName: 'Nadia Rahman', presentation: true, prefs: { ...DEFAULT_PREFS, presentation: true } });
}
