/**
 * What remains of the device data layer: session context and prefs, the IndexedDB key-value store,
 * photo helpers, guest limits, the action catalog and the one-time V0 device import (A9).
 * Screens do NOT import this: they use `@/lib/data/hooks`.
 */
export * from './context';
export * from './device-import';
export * from './guest';
export * from './ids';
export * from './images';
export * from './kv';
export * from './points';
export * from './store';
