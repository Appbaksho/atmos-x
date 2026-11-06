import { z } from 'zod';

import type { GoogleAuthConfig, GoogleIdentity } from '@/lib/data/types';
import { CACHE, handler, HttpError, json, parseBody } from '@/server/api';
import { exchangeGoogleCode, googleConfig } from '@/server/auth/google';
import { makeMeta } from '@/server/meta';

export const runtime = 'nodejs';
export const maxDuration = 20;

/** Is "Continue with Google" set up? The client id is public; the secret never leaves the server. */
export const GET = handler(async () => {
  const cfg = googleConfig();
  const body: GoogleAuthConfig = { enabled: !!cfg, client_id: cfg?.clientId ?? null, meta: makeMeta(true, []) };
  return json(body, { cache: CACHE.none });
});

const Body = z.object({ code: z.string().trim().min(10).max(2048) });

/** Trade the popup's one-time code for the verified Google identity (nothing is stored server-side in v0). */
export const POST = handler(async (req) => {
  // GIS popup mode: Google's CSRF guidance is to accept the code only from our own XHR.
  if (req.headers.get('x-requested-with') !== 'XmlHttpRequest') throw new HttpError(400, 'bad_request', 'Missing X-Requested-With header');
  const { code } = await parseBody(req, Body, 8 * 1024);
  const identity = await exchangeGoogleCode(code, req.headers.get('origin'));
  const body: GoogleIdentity = { ...identity, meta: makeMeta(true, []) };
  return json(body, { cache: CACHE.none });
});
