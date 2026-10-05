/**
 * Guest restrictions (prompt-v0.md §4.5), identical to v1.
 * Guests CAN view everything read-only, scan up to 500 m, see air + farmer alerts without saving
 * fields, and send 5 Ask messages a day. Guests CAN'T log actions, create/join teams, set goals,
 * track trees, add sensors, save fields or get notifications.
 */
import { GuestRestrictedError, RateLimitedError } from '../errors';
import { dayKey } from './ids';

export type ProfileKind = 'guest' | 'user';

export const GUEST_MAX_RADIUS_M = 500;
export const ASK_LIMIT: Record<ProfileKind, number> = { guest: 5, user: 30 };

export type RestrictedFeature =
  | 'log_action'
  | 'teams'
  | 'goals'
  | 'trees'
  | 'sensors'
  | 'fields'
  | 'notifications'
  | 'scan_radius'
  | 'ask_limit';

export function assertAccount(kind: ProfileKind, feature: RestrictedFeature): void {
  if (kind === 'guest') throw new GuestRestrictedError(feature);
}

/** Throws GuestRestricted when a guest asks for a scan wider than 500 m. Clamps to 100–1000. */
export function guardScanRadius(kind: ProfileKind, radius_m: number): number {
  const r = Math.max(100, Math.min(1000, Math.round(radius_m)));
  if (kind === 'guest' && r > GUEST_MAX_RADIUS_M) throw new GuestRestrictedError('scan_radius');
  return r;
}

export type AskUsage = { day: string; count: number };

export function remainingAsks(kind: ProfileKind, usage: AskUsage | undefined, now: Date = new Date()): number {
  const used = usage && usage.day === dayKey(now) ? usage.count : 0;
  return Math.max(0, ASK_LIMIT[kind] - used);
}

/**
 * Check + consume one Ask message. Guests at their 5/day get GuestRestricted (an account gives 30);
 * accounts at 30/day get RateLimited (retry after local midnight).
 */
export function consumeAsk(kind: ProfileKind, usage: AskUsage | undefined, now: Date = new Date()): AskUsage {
  const today = dayKey(now);
  const used = usage && usage.day === today ? usage.count : 0;
  if (used >= ASK_LIMIT[kind]) {
    if (kind === 'guest') throw new GuestRestrictedError('ask_limit');
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    throw new RateLimitedError('Daily Ask Atmos limit reached', Math.ceil((midnight.getTime() - now.getTime()) / 1000));
  }
  return { day: today, count: used + 1 };
}
