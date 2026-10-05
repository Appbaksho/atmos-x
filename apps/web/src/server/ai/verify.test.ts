import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifyPhotoRequest } from '@/lib/data/types';

const structured = vi.fn();
vi.mock('../openai', async (orig) => {
  const real = await orig<typeof import('../openai')>();
  return { ...real, structured: (...a: unknown[]) => structured(...a) };
});

const { decideVerification, verifyPhoto } = await import('./verify');

const NOW = Date.parse('2026-10-05T10:00:00Z');
const zone = { lat: 23.759, lng: 90.359 };
const good = { matches: true, confidence: 0.9, seen: 'looks like a sapling in a guard', issue: 'none' as const };

describe('decideVerification (§5.4)', () => {
  it('verifies a matching, nearby, fresh photo', () => {
    const r = decideVerification(good, { lat: 23.7595, lng: 90.3592, target: zone }, '2026-10-05T09:00:00Z', NOW);
    expect(r).toMatchObject({ status: 'verified', reason_code: 'ok', confidence: 0.9 });
  });
  it('needs confidence ≥ 0.6', () => {
    expect(decideVerification({ ...good, confidence: 0.59 }, { ...zone, target: zone }, '2026-10-05T09:00:00Z', NOW).reason_code).toBe('ai_low_confidence');
    expect(decideVerification({ ...good, confidence: 0.6 }, { ...zone, target: zone }, '2026-10-05T09:00:00Z', NOW).status).toBe('verified');
  });
  it('is pending when the AI says it does not match', () => {
    expect(decideVerification({ ...good, matches: false, issue: 'different_action' }, { ...zone, target: zone }, '2026-10-05T09:00:00Z', NOW).reason_code).toBe('different_action');
    expect(decideVerification({ ...good, matches: false, issue: 'unclear' }, { ...zone, target: zone }, '2026-10-05T09:00:00Z', NOW).reason_code).toBe('ai_mismatch');
  });
  it('checks GPS: within 300 m of the zone, or any location when there is no target', () => {
    expect(decideVerification(good, { lat: 23.77, lng: 90.359, target: zone }, '2026-10-05T09:00:00Z', NOW).reason_code).toBe('gps_far');
    expect(decideVerification(good, { lat: null, lng: null, target: zone }, '2026-10-05T09:00:00Z', NOW).reason_code).toBe('gps_missing');
    expect(decideVerification(good, { lat: 10, lng: 10, target: null }, '2026-10-05T09:00:00Z', NOW).status).toBe('verified');
  });
  it('requires the photo within 24 h', () => {
    expect(decideVerification(good, { ...zone, target: zone }, '2026-10-04T09:59:00Z', NOW).reason_code).toBe('too_old');
    expect(decideVerification(good, { ...zone, target: zone }, '2026-10-05T11:00:00Z', NOW).reason_code).toBe('time_future');
    expect(decideVerification(good, { ...zone, target: zone }, 'yesterday', NOW).reason_code).toBe('time_unknown');
  });
  it('is pending with ai_unavailable when there is no AI verdict', () => {
    expect(decideVerification(null, { ...zone, target: zone }, '2026-10-05T09:00:00Z', NOW)).toMatchObject({ status: 'pending', reason_code: 'ai_unavailable', confidence: 0 });
  });
});

describe('verifyPhoto with a mocked OpenAI', () => {
  const req: VerifyPhotoRequest = {
    image: 'data:image/jpeg;base64,AAAA',
    action_type: 'plant_tree',
    quantity: 1,
    taken_at: new Date().toISOString(),
    lat: zone.lat,
    lng: zone.lng,
    target: zone,
    lang: 'en',
  };
  beforeEach(() => {
    structured.mockReset();
  });

  it('passes the vision verdict through the rules', async () => {
    structured.mockResolvedValue(good);
    const r = await verifyPhoto(req);
    expect(r.status).toBe('verified');
    expect(structured).toHaveBeenCalledOnce();
    const arg = structured.mock.calls[0][0] as { input: { content: { type: string }[] }[] };
    expect(arg.input[0].content.map((c) => c.type)).toEqual(['input_text', 'input_image']);
  });
  it('falls back to pending when OpenAI fails', async () => {
    const { AiUnavailable } = await import('../openai');
    structured.mockRejectedValue(new AiUnavailable('ai_error', 'boom'));
    const r = await verifyPhoto(req);
    expect(r).toMatchObject({ status: 'pending', reason_code: 'ai_unavailable' });
  });
});
