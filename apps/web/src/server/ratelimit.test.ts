import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { HttpError } from './api';
import { _resetLimits, deviceCookie, deviceOf, takeAsk, takePhotoCheck } from './ratelimit';

describe('per-device limits', () => {
  beforeEach(() => _resetLimits());

  it('reads the atmos_device cookie or mints a new device id', () => {
    const known = deviceOf(new NextRequest('http://x/', { headers: { cookie: 'atmos_device=abcdef123456' } }));
    expect(known).toEqual({ id: 'abcdef123456', isNew: false });
    expect(deviceCookie(known)).toEqual({});
    const fresh = deviceOf(new NextRequest('http://x/'));
    expect(fresh.isNew).toBe(true);
    expect(deviceCookie(fresh)['Set-Cookie']).toMatch(/^atmos_device=[a-f0-9]{32}; Path=\/; Max-Age=31536000/);
  });

  it('allows 5 Ask messages a day for guests and 30 for users', () => {
    const dev = { id: 'guestdevice1', isNew: false };
    for (let i = 0; i < 5; i++) expect(takeAsk(dev, 'guest').remaining).toBe(4 - i);
    expect(() => takeAsk(dev, 'guest')).toThrow(HttpError);
    try {
      takeAsk(dev, 'guest');
    } catch (e) {
      expect((e as HttpError).status).toBe(429);
      expect((e as HttpError).code).toBe('rate_limited');
    }
    const user = { id: 'userdevice01', isNew: false };
    for (let i = 0; i < 30; i++) takeAsk(user, 'user');
    expect(() => takeAsk(user, 'user')).toThrow(HttpError);
  });

  it('caps photo checks at 20 a day', () => {
    const dev = { id: 'photodevice1', isNew: false };
    for (let i = 0; i < 20; i++) takePhotoCheck(dev);
    expect(() => takePhotoCheck(dev)).toThrow(HttpError);
  });
});
