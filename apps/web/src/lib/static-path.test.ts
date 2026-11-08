import { describe, expect, it } from 'vitest';

import { isStaticFilePath } from './static-path';

describe('isStaticFilePath', () => {
  it('matches real static files', () => {
    for (const p of ['/sw.js', '/robots.txt', '/sitemap.xml', '/icons/icon-192.png', '/maplibre/6.12.0/maplibre-gl-worker.mjs', '/offline.html', '/manifest.webmanifest']) {
      expect(isStaticFilePath(p), p).toBe(true);
    }
  });

  it('leaves app pages whose ids contain dots to locale routing', () => {
    for (const p of ['/app/farm/alert/lightning-2026-11-09@23.8,90.4', '/app/farm/alert/lightning-2026-11-09%4023.8%2C90.4', '/app/farm/alert/abc.4', '/bn/app/farm/alert/rice_heat-2026-11-10@23.8,90.4', '/app/map', '/app']) {
      expect(isStaticFilePath(p), p).toBe(false);
    }
  });
});
