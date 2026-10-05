import { beforeEach, describe, expect, it } from 'vitest';

import { DataError, RateLimitedError } from '../errors';
import type { VerifyPhotoRequest } from '../types';
import { confirmAction, listActions, logAction } from './actions';
import { applyCooling, createGoal, h3Resolution, listGoals, milestonesCrossed, progressPct, zoneAreaKm2 } from './goals';
import { listNotifications } from './notifications';
import { getPhoto } from './store';
import { freshStore, userCtx } from './test-helpers';
import { listTrees } from './trees';

const photo = () => new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
const input = (over = {}) => ({
  action_type: 'plant_tree' as const,
  quantity: 3,
  lat: 23.76,
  lng: 90.36,
  taken_at: new Date().toISOString(),
  photo: photo(),
  species_id: 'neem',
  nickname: 'Shanti',
  ...over,
});

describe('logAction', () => {
  beforeEach(freshStore);

  it('verified: stores the photo, scores points, notifies and creates trees', async () => {
    const ctx = userCtx({ lang: 'bn' });
    const seen: VerifyPhotoRequest[] = [];
    const r = await logAction(ctx, input(), {
      prepare: async (b) => ({ stored: b, preview: 'data:image/jpeg;base64,AAA' }),
      verify: async (req) => {
        seen.push(req);
        return { status: 'verified', confidence: 0.82, seen: 'তিনটি চারা', reason_code: 'ok' };
      },
    });
    expect(seen[0]).toMatchObject({ image: 'data:image/jpeg;base64,AAA', action_type: 'plant_tree', quantity: 3, lang: 'bn' });
    expect(r.log).toMatchObject({ status: 'verified', points: 150, trees: 3 });
    expect(await getPhoto(r.log.photo_url!)).toBeInstanceOf(Blob);
    expect(r.trees.map((t) => t.nickname)).toEqual(['Shanti 1', 'Shanti 2', 'Shanti 3']);
    expect((await listTrees(ctx.ns)).every((t) => t.status === 'ok' && t.species_id === 'neem')).toBe(true);
    const notes = await listNotifications(ctx, []);
    expect(notes[0]).toMatchObject({ kind: 'verification', title: { code: 'notif.verification.verified' }, screen: 'S15' });
    expect((await listActions(ctx.ns))[0].id).toBe(r.log.id);
  });

  it('falls back to pending when the AI is unavailable or rate limited', async () => {
    const ctx = userCtx();
    const prepare = async (b: Blob) => ({ stored: b, preview: 'x' });
    const down = await logAction(ctx, input({ action_type: 'cool_roof', quantity: 12 }), {
      prepare,
      verify: async () => {
        throw new DataError('server.not_available', 'nope', 404);
      },
    });
    expect(down.log).toMatchObject({ status: 'pending', points: 360, verification: { reason_code: 'unavailable' } });
    expect(down.trees).toEqual([]);
    const limited = await logAction(ctx, input(), {
      prepare,
      verify: async () => {
        throw new RateLimitedError();
      },
    });
    expect(limited.log.verification?.reason_code).toBe('rate_limited');
    const noPhoto = await logAction(ctx, input({ photo: null }), { prepare, verify: async () => ({ status: 'verified', confidence: 1, seen: '', reason_code: 'ok' }) });
    expect(noPhoto.log).toMatchObject({ status: 'pending', photo_url: null, verification: { reason_code: 'no_photo' } });

    const confirmed = await confirmAction(ctx, down.log.id);
    expect(confirmed.status).toBe('verified');
    await expect(confirmAction(ctx, down.log.id)).rejects.toMatchObject({ code: 'action.not_pending' });
  });

  it('updates goal progress and fires milestone notifications', async () => {
    const ctx = userCtx();
    const goal = await createGoal(ctx, { zone: { id: 'z-1', name: 'Asad Gate', centroid: { lat: 23.76, lng: 90.36 } }, target_c: 0.01, by_date: '2027-10-01', team_id: 't-x' });
    expect(goal.target_c).toBe(-0.01);
    // 0.0006 °C/km² per tree over 0.05 km² = 0.012 °C per tree → ≥ 100 % with one tree
    const r = await logAction(ctx, input({ quantity: 1, goal_id: goal.id }), {
      prepare: async (b) => ({ stored: b, preview: 'x' }),
      verify: async (req) => {
        expect(req.target).toEqual({ lat: 23.76, lng: 90.36 });
        return { status: 'verified', confidence: 0.9, seen: '', reason_code: 'ok' };
      },
    });
    expect(r.milestones).toEqual([25, 50, 75, 100]);
    expect(r.log.team_id).toBe('t-x');
    expect((await listGoals(ctx.ns))[0].progress_pct).toBe(100);
    const kinds = (await listNotifications(ctx, [])).map((n) => n.kind);
    expect(kinds.filter((k) => k === 'goal_progress')).toHaveLength(4);
  });
});

describe('goal maths', () => {
  it('progress and milestones', () => {
    expect(progressPct(-0.57, -1.5)).toBe(38);
    expect(milestonesCrossed(20, 52)).toEqual([25, 50]);
    expect(milestonesCrossed(52, 52)).toEqual([]);
    const g = { id: 'g', zone_id: 'z', zone_name: 'Z', zone_centroid: { lat: 0, lng: 0 }, target_c: -1.5, by_date: '', progress_pct: 38, modeled_c: -0.57, team_id: null, org_id: null, created_at: '', zone_area_km2: 0.12 };
    const r = applyCooling(g, 0.0006 * 10);
    expect(r.goal.modeled_c).toBe(-0.62);
    expect(r.goal.progress_pct).toBe(41);
  });

  it('reads H3 resolution and zone area without h3-js', () => {
    expect(h3Resolution('8a2a1072b59ffff')).toBe(10);
    expect(h3Resolution('8b2a1072b59afff')).toBe(11);
    expect(zoneAreaKm2(Array(8).fill('8a2a1072b59ffff'))).toBeCloseTo(0.1204, 3);
    expect(zoneAreaKm2([])).toBe(0.05);
  });
});
