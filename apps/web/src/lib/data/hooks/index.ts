/**
 * The data API for screens (prompt-v0.md §1 rule 4): import ONLY from '@/lib/data/hooks'.
 * Hook names stay the same in v1; their internals switch to FastAPI.
 * Reference: docs/handoff/v0-3.md.
 */
export * from './actions';
export * from './air';
export * from './ask';
export * from './community';
export * from './context';
export * from './device-import';
export * from './farm';
export * from './geo';
export * from './goals';
export * from './heat';
export { getJSON, postJSON, routePath, shouldRetry, withQuery } from './http';
export * from './keys';
export * from './notifications';
export * from './photos';
export * from './plan';
export * from './profile';
export * from './session';
export * from './sources';
export * from './store';
export * from './trees';

export { DEMO_POINT } from '@/lib/location';
export { GUEST_MAX_RADIUS_M, ASK_LIMIT } from '../local/guest';
export { DataError, GuestRestrictedError, RateLimitedError, isGuestRestricted } from '../errors';
