/**
 * Proxy (Next 16's renamed middleware).
 * 1. Sets the anonymous `atmos_device` cookie (per-device rate limits in /api/v0) when missing.
 *    On the first request the new id is also forwarded upstream in the request's Cookie header,
 *    so route handlers see it immediately.
 * 2. Runs next-intl locale routing for pages only; never for /api, /_next, sw.js, the manifest,
 *    icons or any static file.
 * 3. Opens CORS on /api to every origin: answers preflights itself and stamps the headers on all
 *    API responses. No Allow-Credentials (invalid with `*`), so cross-origin calls carry no cookies.
 */
import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

import { routing } from './i18n/routing';
import { isStaticFilePath } from './lib/static-path';

const intl = createMiddleware(routing);

const DEVICE_COOKIE = 'atmos_device';
const ONE_YEAR_S = 60 * 60 * 24 * 365;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

function withCors(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value);
  return response;
}

function skipsI18n(pathname: string): boolean {
  return (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/_vercel') ||
    pathname === '/sw.js' ||
    pathname.startsWith('/manifest') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/brand/') ||
    isStaticFilePath(pathname)
  );
}

export default function proxy(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith('/api');
  if (isApi && request.method === 'OPTIONS') return withCors(new NextResponse(null, { status: 204 }));

  const existing = request.cookies.get(DEVICE_COOKIE)?.value;
  const deviceId = existing ?? crypto.randomUUID();
  let response: NextResponse;

  if (skipsI18n(request.nextUrl.pathname)) {
    if (existing) return isApi ? withCors(NextResponse.next()) : NextResponse.next();
    const headers = new Headers(request.headers);
    const cookie = headers.get('cookie');
    headers.set('cookie', `${cookie ? `${cookie}; ` : ''}${DEVICE_COOKIE}=${deviceId}`);
    response = NextResponse.next({ request: { headers } });
  } else {
    response = intl(request);
  }

  if (!existing) {
    response.cookies.set(DEVICE_COOKIE, deviceId, {
      maxAge: ONE_YEAR_S,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      // Secure only over HTTPS (plain-http LAN testing on phones would otherwise drop the cookie).
      secure: request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https',
    });
  }
  return isApi ? withCors(response) : response;
}

export const config = {
  matcher: [
    // Everything except build output, image optimisation, the service worker, the manifest,
    // public icons/brand files and any path with a static-file extension.
    '/((?!_next/static|_next/image|sw\\.js|manifest\\.webmanifest|icons/|brand/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|ttf|otf|woff|woff2|txt|xml|json|js|css|map|html|webmanifest)$).*)',
  ],
};
