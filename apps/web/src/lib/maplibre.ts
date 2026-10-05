/**
 * One place that tells MapLibre GL (v6) where its web worker lives.
 *
 * maplibre-gl v6 resolves `maplibre-gl-worker.mjs` relative to its own module (`import.meta.url`),
 * which Turbopack rewrites to a chunk URL, so the default worker 404s. We self-host the
 * version-matched worker + the shared chunk it imports under `/maplibre/<version>/`
 * (copied from node_modules by scripts/vendor-maplibre.mjs on predev/prebuild), so maps need no
 * CDN (tiles excepted) and the service worker can cache the files.
 *
 * Override with NEXT_PUBLIC_MAPLIBRE_WORKER_URL (e.g. a CDN URL); cross-origin URLs are wrapped by
 * MapLibre in a same-origin blob module worker.
 */
type MapLibreModule = Pick<typeof import('maplibre-gl'), 'getVersion' | 'setWorkerUrl'>;

let configured = false;

export function maplibreWorkerUrl(version: string): string {
  return process.env.NEXT_PUBLIC_MAPLIBRE_WORKER_URL || `/maplibre/${version}/maplibre-gl-worker.mjs`;
}

/** Call once with the imported module before creating the first map (idempotent). */
export function configureMaplibre(ml: MapLibreModule): void {
  if (configured) return;
  configured = true;
  try {
    ml.setWorkerUrl(maplibreWorkerUrl(ml.getVersion()));
  } catch (e) {
    console.warn('[atmos] maplibre worker setup failed', e);
  }
}
