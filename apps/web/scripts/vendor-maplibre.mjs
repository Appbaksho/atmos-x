#!/usr/bin/env node
/**
 * Copy MapLibre's module worker (+ the shared chunk it imports) from node_modules into
 * public/maplibre/<version>/ so maps work without a CDN. src/lib/maplibre.ts points
 * setWorkerUrl() at /maplibre/<getVersion()>/maplibre-gl-worker.mjs. Runs before dev/build
 * (predev/prebuild); idempotent. Old version folders are removed.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', 'maplibre-gl');
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const outRoot = join(root, 'public', 'maplibre');
const out = join(outRoot, version);
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

mkdirSync(out, { recursive: true });
for (const f of FILES) {
  const src = join(pkgDir, 'dist', f);
  const dst = join(out, f);
  if (!existsSync(dst) || readFileSync(dst).length !== readFileSync(src).length) copyFileSync(src, dst);
}
for (const d of readdirSync(outRoot)) if (d !== version) rmSync(join(outRoot, d), { recursive: true, force: true });
console.log(`[atmos] maplibre worker ${version} → public/maplibre/${version}/`);
