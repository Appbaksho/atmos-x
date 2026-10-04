import { beforeEach, describe, expect, it } from 'vitest';

import { GuestRestrictedError, RateLimitedError } from '../errors';
import { logAction } from './actions';
import { askRemaining, consumeAskQuota } from './ask';
import { addField, addSensor, listFields, listSensors } from './farm';
import { createGoal } from './goals';
import { assertAccount, ASK_LIMIT, consumeAsk, guardScanRadius, remainingAsks } from './guest';
import { listNotifications } from './notifications';
import { myStats } from './profile';
import { freshStore, guestCtx, userCtx } from './test-helpers';

const noDeps = {
  prepare: async () => ({ stored: new Blob(), preview: '' }),
  verify: async () => ({ status: 'verified' as const, confidence: 1, seen: '', reason_code: 'ok' }),
};

describe('guest restrictions (§4.5)', () => {
  beforeEach(freshStore);

  it('assertAccount throws the typed error for guests only', () => {
    expect(() => assertAccount('guest', 'goals')).toThrow(GuestRestrictedError);
    expect(() => assertAccount('user', 'goals')).not.toThrow();
  });

  it('guests scan up to 500 m', () => {
    expect(guardScanRadius('guest', 500)).toBe(500);
    expect(() => guardScanRadius('guest', 501)).toThrow(GuestRestrictedError);
    expect(guardScanRadius('user', 1000)).toBe(1000);
    expect(guardScanRadius('user', 5000)).toBe(1000);
    expect(guardScanRadius('guest', 20)).toBe(100);
  });

  it('guests cannot log actions, set goals, save fields or add sensors', async () => {
    const g = guestCtx();
    const input = { action_type: 'plant_tree' as const, quantity: 1, lat: null, lng: null, taken_at: new Date().toISOString(), photo: null };
    await expect(logAction(g, input, noDeps)).rejects.toBeInstanceOf(GuestRestrictedError);
    await expect(
      createGoal(g, { zone: { id: 'z', name: 'Z', centroid: { lat: 0, lng: 0 } }, target_c: -1, by_date: '2027-01-01' }),
    ).rejects.toBeInstanceOf(GuestRestrictedError);
    await expect(addField(g, { name: 'N', crop: 'boro', stage: 'flowering', location: { lat: 0, lng: 0 } })).rejects.toBeInstanceOf(GuestRestrictedError);
    await expect(addSensor(g, { name: 'S', location: null })).rejects.toBeInstanceOf(GuestRestrictedError);
  });

  it('guests read empty personal data and get no notifications', async () => {
    const g = guestCtx();
    expect(await listFields(g)).toEqual([]);
    expect(await listSensors(g, 50)).toEqual([]);
    expect(await listNotifications(g, [])).toEqual([]);
    expect((await myStats(g)).points).toBe(0);
  });

  it('accounts can do all of it', async () => {
    const u = userCtx();
    await expect(addField(u, { name: 'North plot', crop: 'boro', stage: 'flowering', location: { lat: 23.77, lng: 90.34 } })).resolves.toMatchObject({ crop: 'boro' });
    const [s] = [await addSensor(u, { name: 'Balcony', location: null })];
    const readings = await listSensors(u, 60, 1_000_000_000_000);
    expect(readings[0].id).toBe(s.id);
    expect(readings[0].pm25).toBeGreaterThan(60 * 0.9);
    expect(readings[0].pm25).toBeLessThan(60 * 1.1);
    expect(readings[0].simulated).toBe(true);
  });
});

describe('Ask quota', () => {
  beforeEach(freshStore);
  const day = new Date(2026, 9, 6, 10);

  it('5 a day for guests, then GuestRestricted', () => {
    let u = undefined as ReturnType<typeof consumeAsk> | undefined;
    for (let i = 0; i < ASK_LIMIT.guest; i++) u = consumeAsk('guest', u, day);
    expect(remainingAsks('guest', u, day)).toBe(0);
    expect(() => consumeAsk('guest', u, day)).toThrow(GuestRestrictedError);
    // next day resets
    expect(consumeAsk('guest', u, new Date(2026, 9, 7, 9)).count).toBe(1);
  });

  it('30 a day for accounts, then RateLimited with retry-after', () => {
    let u = undefined as ReturnType<typeof consumeAsk> | undefined;
    for (let i = 0; i < ASK_LIMIT.user; i++) u = consumeAsk('user', u, day);
    try {
      consumeAsk('user', u, day);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitedError);
      expect((e as RateLimitedError).retryAfter).toBe(14 * 3600);
    }
  });

  it('is persisted per namespace', async () => {
    const g = guestCtx();
    expect(await askRemaining(g, day)).toBe(5);
    expect(await consumeAskQuota(g, day)).toBe(4);
    expect(await askRemaining(g, day)).toBe(4);
    expect(await askRemaining(userCtx(), day)).toBe(30);
  });
});
