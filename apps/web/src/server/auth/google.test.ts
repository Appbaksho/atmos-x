import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { claimsFromIdToken, exchangeGoogleCode, googleConfig } from './google';

const CLIENT = 'test-client.apps.googleusercontent.com';
const NOW = 1_790_000_000;
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = (over: Record<string, unknown> = {}) =>
  `${b64({ alg: 'RS256' })}.${b64({ iss: 'https://accounts.google.com', aud: CLIENT, sub: '1234567890', email: 'Nadia@Example.com', email_verified: true, name: 'Nadia Rahman', picture: 'https://lh3.googleusercontent.com/a/x', exp: NOW + 3600, iat: NOW, ...over })}.sig`;

describe('claimsFromIdToken', () => {
  it('accepts a fresh token for our client with a verified email', () => {
    expect(claimsFromIdToken(idToken(), CLIENT, NOW)).toEqual({ sub: '1234567890', email: 'Nadia@Example.com', name: 'Nadia Rahman', picture: 'https://lh3.googleusercontent.com/a/x' });
  });
  it('rejects another audience, a foreign issuer, an expired token and a malformed token', () => {
    expect(() => claimsFromIdToken(idToken({ aud: 'someone-else' }), CLIENT, NOW)).toThrow(/audience/);
    expect(() => claimsFromIdToken(idToken({ iss: 'https://evil.example' }), CLIENT, NOW)).toThrow(/issuer/);
    expect(() => claimsFromIdToken(idToken({ exp: NOW - 600 }), CLIENT, NOW)).toThrow(/expired/);
    expect(() => claimsFromIdToken('not-a-jwt', CLIENT, NOW)).toThrow(/malformed/);
  });
  it('needs a verified email', () => {
    expect(() => claimsFromIdToken(idToken({ email_verified: false }), CLIENT, NOW)).toThrow(expect.objectContaining({ code: 'auth.google_unverified', status: 403 }));
    expect(claimsFromIdToken(idToken({ email_verified: 'true' }), CLIENT, NOW).sub).toBe('1234567890');
  });
});

describe('exchangeGoogleCode', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', CLIENT);
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'shh');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('is off without both env vars', () => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', '');
    expect(googleConfig()).toBeNull();
    return expect(exchangeGoogleCode('4/abcdefghij', null)).rejects.toMatchObject({ code: 'auth.google_not_configured', status: 503 });
  });

  it('trades the code with redirect_uri=postmessage and returns the identity', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { id_token: idToken({ exp: Date.now() / 1000 + 3600 }) }));
    const id = await exchangeGoogleCode('4/abcdefghij', 'https://atmos.example');
    expect(id).toEqual({ provider: 'google', subject: '1234567890', email: 'nadia@example.com', display_name: 'Nadia Rahman', avatar_url: 'https://lh3.googleusercontent.com/a/x' });
    const sent = new URLSearchParams(String(fetchMock.mock.calls[0][1].body));
    expect(Object.fromEntries(sent)).toMatchObject({ code: '4/abcdefghij', client_id: CLIENT, client_secret: 'shh', redirect_uri: 'postmessage', grant_type: 'authorization_code' });
  });

  it('retries once with the page origin on redirect_uri_mismatch', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'redirect_uri_mismatch' })).mockResolvedValueOnce(reply(200, { id_token: idToken({ exp: Date.now() / 1000 + 3600 }) }));
    await exchangeGoogleCode('4/abcdefghij', 'https://atmos.example');
    expect(new URLSearchParams(String(fetchMock.mock.calls[1][1].body)).get('redirect_uri')).toBe('https://atmos.example');
  });

  it('maps a bad code to auth.google_failed and Google outages to an upstream error', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'invalid_grant' }));
    await expect(exchangeGoogleCode('4/abcdefghij', null)).rejects.toMatchObject({ code: 'auth.google_failed', status: 401 });
    fetchMock.mockResolvedValueOnce(reply(503, {}));
    await expect(exchangeGoogleCode('4/abcdefghij', null)).rejects.toMatchObject({ name: 'UpstreamError' });
  });
});
