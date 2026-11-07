/* Atmos X service worker (hand-written, prompt-v0 §4.2, prompt-v1 §8.4 and W2).
 * - Precache the app shell + /offline.html.
 * - Navigations: network first, fall back to the cached page, then /offline.html.
 * - /_next/static, icons, fonts: cache first (immutable, content-hashed).
 * - GET /api/v1/{conditions,zones,air,farm/alerts,nurseries,species}: stale-while-revalidate, but
 *   never a response marked private or no-store, and never farm alerts for a saved field.
 * - Everything else under /api (sessions, posts, chat, store, orders, Ask): network only.
 * - Web push: `push` shows the short line the server sent; `notificationclick` focuses or opens the app.
 * - /maplibre/<version>/ (self-hosted MapLibre worker): cache first.
 * Registered only in production builds (src/components/cz/shell/sw-register.tsx) as
 * `/sw.js?v=<build stamp>`: cache names carry the stamp, and `activate` deletes every cache from
 * older builds, so a redeploy replaces the old caches cleanly. Bump RULES when caching rules change.
 */
const RULES = 'v1-1';
const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const VERSION = `atmos-${RULES}-${BUILD}`;
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;
const API_CACHE = `${VERSION}-api`;
const PAGE_CACHE = `${VERSION}-pages`;

const SHELL = ['/', '/app', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/brand/atmosx-logo.png'];
const SWR_API = /^\/api\/v1\/(conditions|air|zones|farm\/alerts|nurseries|species)(\/|$)/;

/** Shared, public data only: a private or no-store response is never written to the cache. */
function cacheable(res) {
  const cc = (res.headers.get('Cache-Control') || '').toLowerCase();
  return res.ok && !cc.includes('private') && !cc.includes('no-store') && !res.headers.has('Set-Cookie');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(`${VERSION}-`)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function staleWhileRevalidate(event, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (cacheable(res)) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => cached || Response.json({ code: 'offline', message: 'Offline' }, { status: 503 }));
      if (cached) {
        event.waitUntil(network.catch(() => undefined));
        return cached;
      }
      return network;
    }),
  );
}

function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }),
    ),
  );
}

function networkFirstPage(request) {
  return fetch(request)
    .then((res) => {
      if (res.ok) caches.open(PAGE_CACHE).then((c) => c.put(request, res.clone()));
      return res;
    })
    .catch(() =>
      caches
        .match(request, { ignoreSearch: true })
        .then((cached) => cached || caches.match('/app'))
        .then((cached) => cached || caches.match('/offline.html')),
    );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // POST etc.: network only
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (SWR_API.test(url.pathname) && !url.searchParams.has('field_id')) event.respondWith(staleWhileRevalidate(event, API_CACHE));
    return; // everything else: network only
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/maplibre/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/brand/') || /\.(woff2?|ttf|png|jpg|jpeg|webp|svg)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});

/* ── Web push (W2) ── */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Atmos X';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-maskable-192.png',
      data: { url: data.url || '/app/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/app/notifications', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.focus().then((w) => (w && 'navigate' in w ? w.navigate(target.href) : undefined));
      return self.clients.openWindow(target.href);
    }),
  );
});
