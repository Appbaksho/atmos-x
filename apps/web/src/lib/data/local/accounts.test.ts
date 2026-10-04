import { beforeEach, describe, expect, it } from 'vitest';

import { buildClientState, CLIENT_STATE_MAX_BYTES } from './ask';
import { hashPassword, listAccounts, loginAccount, registerAccount, verifyPassword } from './accounts';
import { freshStore } from './test-helpers';
import type { Tree } from '../types';

describe('local accounts', () => {
  beforeEach(freshStore);

  it('hashes with PBKDF2 and never stores the password', async () => {
    const h = await hashPassword('correct horse', undefined, 1000);
    expect(h.algo).toBe('PBKDF2-SHA256');
    expect(h.hash).not.toContain('correct');
    expect(await verifyPassword('correct horse', h)).toBe(true);
    expect(await verifyPassword('wrong horse', h)).toBe(false);
    const again = await hashPassword('correct horse', undefined, 1000);
    expect(again.salt).not.toBe(h.salt);
  });

  it('registers, rejects duplicates, logs in', async () => {
    const acc = await registerAccount({ display_name: 'Nadia', email: ' Nadia@Example.com ', password: 'longenough', lang: 'bn' });
    expect(acc).toMatchObject({ email: 'nadia@example.com', lang: 'bn' });
    expect(JSON.stringify(await listAccounts())).not.toContain('longenough');
    await expect(registerAccount({ display_name: 'X', email: 'nadia@example.com', password: 'longenough', lang: 'en' })).rejects.toMatchObject({ code: 'auth.email_taken' });
    await expect(registerAccount({ display_name: 'X', email: 'x@y.z', password: 'short', lang: 'en' })).rejects.toMatchObject({ code: 'auth.weak_password' });
    await expect(loginAccount('NADIA@example.com', 'longenough')).resolves.toMatchObject({ id: acc.id });
    await expect(loginAccount('nadia@example.com', 'nope-nope')).rejects.toMatchObject({ code: 'auth.invalid_credentials' });
  }, 20_000);
});

describe('Ask client_state', () => {
  const tree = (i: number): Tree => ({
    id: `ATX-26-${i}`,
    species_id: 'neem',
    nickname: `Tree ${i}`,
    planted_at: '',
    location: null,
    last_check_at: null,
    next_due_at: '2026-10-20T00:00:00.000Z',
    status: 'ok',
    health: 'healthy',
    photo_url: null,
  });

  it('keeps it compact and ≤ 6 KB', () => {
    const s = buildClientState({
      kind: 'user',
      unit: 'C',
      farmer: true,
      trees: Array.from({ length: 50 }, (_, i) => tree(i)),
      goal: { id: 'g', zone_id: 'z', zone_name: 'Asad Gate block', zone_centroid: { lat: 0, lng: 0 }, target_c: -1.5, by_date: '2027-10-02', progress_pct: 38, modeled_c: -0.57, team_id: null, org_id: null, created_at: '' },
      visible: { zone: 'Asad Gate', score: 86, long: 'x'.repeat(5000), rows: Array.from({ length: 200 }, (_, i) => ({ i, name: `row ${i}` })) },
    });
    expect(new TextEncoder().encode(JSON.stringify(s)).length).toBeLessThanOrEqual(CLIENT_STATE_MAX_BYTES);
    expect(s.trees!.length).toBeLessThanOrEqual(20);
    expect(s.goal).toEqual({ zone_name: 'Asad Gate block', target_c: -1.5, by_date: '2027-10-02', progress_pct: 38 });
    expect(s.visible?.zone).toBe('Asad Gate');
    expect(s.visible?.rows).toBeUndefined();
    expect((s.visible?.long as string).length).toBeLessThan(500);
    expect(s).toMatchObject({ profile: 'user', units: 'C', farmer: true });
  });
});
