import 'server-only';

import type { GoogleIdentity } from '@/lib/data/types';

import { HttpError } from '../api';
import { env } from '../env';
import { UpstreamError } from '../http';
import { errMsg } from '../util';

/**
 * "Continue with Google" (v0). The browser gets a one-time code from Google's popup (GIS code
 * client); this trades it for tokens with the server-only client secret and returns the verified
 * identity. Nothing is stored here: the account lives on the device (prompt-v0.md §4.5). v1 moves
 * this behind /auth/oauth/google/* with the same provider + subject pair (auth_identities).
 */

const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
/** Clock skew allowed on `exp` / `iat`. */
const SKEW_S = 120;

export type GoogleClaims = { sub: string; email: string; name: string | null; picture: string | null };

export function googleConfig(): { clientId: string; clientSecret: string } | null {
  const { clientId, clientSecret } = env.google;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

const fail = (why: string) => new HttpError(401, 'auth.google_failed', `Google sign-in failed: ${why}`);

function decodePayload(idToken: string): Record<string, unknown> {
  const part = idToken.split('.')[1];
  if (!part) throw fail('malformed id_token');
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw fail('malformed id_token');
  }
}

/**
 * Check the ID token's claims. The token comes straight from Google's token endpoint over TLS, so
 * per OpenID Connect Core §3.1.3.7 the TLS server check stands in for the signature check.
 */
export function claimsFromIdToken(idToken: string, clientId: string, nowS = Date.now() / 1000): GoogleClaims {
  const p = decodePayload(idToken);
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!aud.includes(clientId)) throw fail('wrong audience');
  if (typeof p.iss !== 'string' || !ISSUERS.has(p.iss)) throw fail('wrong issuer');
  if (typeof p.exp !== 'number' || p.exp < nowS - SKEW_S) throw fail('expired');
  if (typeof p.sub !== 'string' || !p.sub) throw fail('no subject');
  if (typeof p.email !== 'string' || !p.email) throw fail('no email');
  if (p.email_verified !== true && p.email_verified !== 'true') throw new HttpError(403, 'auth.google_unverified', 'The Google account email is not verified');
  return { sub: p.sub, email: p.email, name: typeof p.name === 'string' ? p.name : null, picture: typeof p.picture === 'string' ? p.picture : null };
}

type TokenReply = { status: number; body: { id_token?: string; error?: string; error_description?: string } };

async function tokenRequest(code: string, redirectUri: string, cfg: { clientId: string; clientSecret: string }): Promise<TokenReply> {
  let res: Response;
  try {
    res = await fetch(env.upstream.googleToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new UpstreamError(`Google token endpoint: ${errMsg(e)}`);
  }
  const body = (await res.json().catch(() => ({}))) as TokenReply['body'];
  return { status: res.status, body };
}

/**
 * Popup codes are exchanged with redirect_uri "postmessage" (what Google's own libraries send);
 * if Google wants the page origin instead (redirect_uri_mismatch), retry once with it.
 */
export async function exchangeGoogleCode(code: string, pageOrigin: string | null): Promise<Omit<GoogleIdentity, 'meta'>> {
  const cfg = googleConfig();
  if (!cfg) throw new HttpError(503, 'auth.google_not_configured', 'Google sign-in is not set up on this server');
  let r = await tokenRequest(code, 'postmessage', cfg);
  if (r.body.error === 'redirect_uri_mismatch' && pageOrigin) r = await tokenRequest(code, pageOrigin, cfg);
  if (r.status >= 500) throw new UpstreamError(`Google token endpoint HTTP ${r.status}`);
  if (r.status !== 200 || !r.body.id_token) {
    if (r.body.error === 'invalid_client' || r.body.error === 'unauthorized_client') console.error(`[atmos] Google sign-in misconfigured: ${r.body.error}`);
    throw fail(r.body.error ?? `HTTP ${r.status}`);
  }
  const c = claimsFromIdToken(r.body.id_token, cfg.clientId);
  return { provider: 'google', subject: c.sub, email: c.email.trim().toLowerCase(), display_name: c.name?.trim() || c.email.split('@')[0], avatar_url: c.picture };
}
