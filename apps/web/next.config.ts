import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Build stamp for the service worker: the client registers `/sw.js?v=<stamp>`, and sw.js names its
 * caches after it, so every deploy installs a fresh worker and deletes the previous build's caches.
 * Set ATMOS_BUILD_ID (e.g. a git hash) to pin it; otherwise the build time is used.
 */
process.env.ATMOS_BUILD_ID ||= new Date().toISOString().replace(/\D/g, '').slice(0, 14);

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (apps/web/Dockerfile).
  output: 'standalone',
  env: { NEXT_PUBLIC_BUILD_ID: process.env.ATMOS_BUILD_ID },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Camera (log action, tree checks) and location are used by the app itself.
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        // Self-hosted MapLibre worker (src/lib/maplibre.ts): versioned path, safe to cache for good.
        source: '/maplibre/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
