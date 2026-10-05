/**
 * npm run snapshot:dhaka — record the Dhaka demo responses (prompt-v0.md §5.6) by calling the
 * server modules directly (no dev server needed). Writes src/server/snapshots/dhaka/*.json and
 * regenerates its index.ts. Run with tsx --conditions react-server (see package.json).
 * Re-run the morning of the presentation. Zone "why" explanations use OpenAI (cached 7 days).
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Locale } from '@/lib/data/types';
import { fetchAir, getAir } from '@/server/air/air';
import { env } from '@/server/env';
import { getFarmAlerts } from '@/server/farm/alerts';
import { reverseResponse } from '@/server/geo/geo';
import { runScan, scanResponse } from '@/server/heat/scan';
import { getZoneDetail } from '@/server/heat/zone';
import { getNurseries } from '@/server/places/nurseries';
import { getProjection } from '@/server/plan/projection';
import { getSpeciesList } from '@/server/plan/species';
import { getPlantingSpots } from '@/server/plan/spots';
import { getArchive } from '@/server/weather/archive';
import { getConditions } from '@/server/weather/conditions';
import { getForecast } from '@/server/weather/forecast';
import { cellArea } from 'h3-js';

import { fileNameFor, renderIndex } from './snapshot-lib';

const DIR = path.join(process.cwd(), 'src/server/snapshots/dhaka');
const LANGS: Locale[] = ['en', 'bn'];
const RADII = [300, 500, 1000];

const saved: string[] = [];
const failed: string[] = [];

async function save(name: string, fn: () => Promise<unknown>) {
  const t0 = performance.now();
  try {
    const v = await fn();
    if (v == null) throw new Error('empty');
    const live = (v as { meta?: { live?: boolean }; live?: boolean }).meta?.live ?? (v as { live?: boolean }).live;
    if (live === false) console.warn(`  ! ${name}: not live (served from fallback)`);
    await writeFile(path.join(DIR, fileNameFor(name)), JSON.stringify(v, null, 1) + '\n');
    saved.push(name);
    console.log(`  ✓ ${name} ${Math.round(performance.now() - t0)}ms`);
  } catch (e) {
    failed.push(name);
    console.error(`  ✗ ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  const p = env.demo;
  console.log(`Snapshotting Dhaka demo point ${p.lat}, ${p.lng} → ${DIR}`);
  await mkdir(DIR, { recursive: true });
  // --clean wipes old snapshots first; by default old files stay (a failed upstream keeps yesterday's file).
  if (process.argv.includes('--clean')) for (const f of await readdir(DIR)) if (f.endsWith('.json')) await rm(path.join(DIR, f));

  // Raw inputs (let conditions / farm alerts / air recompute for any crop or language offline).
  await save('raw.forecast', () => getForecast(p));
  await save('raw.archive', () => getArchive(p));
  await save('raw.air', () => fetchAir(p));

  for (const lang of LANGS) {
    await save(`conditions.${lang}`, () => getConditions(p, lang));
    await save(`reverse.${lang}`, () => reverseResponse(p, lang));
    await save(`species.${lang}`, () => getSpeciesList(p, lang));
    for (const crop of ['boro', 'aman'] as const) await save(`farm.${crop}.flowering.${lang}`, () => getFarmAlerts(p, crop, 'flowering', lang));
  }
  await save('air', () => getAir(p));
  await save('nurseries', () => getNurseries(p, 10_000));

  for (const r of RADII) {
    const { scan } = await runScan(p, r);
    if (scan.method !== 'osm-proxy') {
      console.error(`  ✗ zones.${r}: Overpass unavailable (synthetic), skipping this radius`);
      failed.push(`zones.${r}`);
      continue;
    }
    for (const lang of LANGS) await save(`zones.${r}.${lang}`, async () => scanResponse(scan, lang));
    // Zone details (with the AI "why"): every zone of the demo radius, else own + hottest.
    const ids = r === 500 ? scan.zones.map((z) => z.id) : [...new Set([scan.my_zone_id, scan.zones[0]?.id].filter((x): x is string => !!x))];
    for (const id of ids) {
      for (const lang of LANGS) await save(`zone.${id}.${lang}`, () => getZoneDetail(id, lang));
    }
    for (const id of [...new Set([scan.my_zone_id, scan.zones[0]?.id].filter((x): x is string => !!x))]) {
      const z = scan.zones.find((x) => x.id === id);
      if (!z) continue;
      const area = z.h3.reduce((a, h) => a + cellArea(h, 'km2'), 0);
      await save(`projection.${id}`, () => getProjection(z.centroid, area, { trees: 100, roof_m2: 500, shade: 0 }));
      await save(`spots.${id}`, () => getPlantingSpots(id, z.h3));
    }
  }

  const all = (await readdir(DIR)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  await writeFile(path.join(DIR, 'index.ts'), renderIndex(all));
  console.log(`\nSaved ${saved.length} snapshots (index has ${all.length})${failed.length ? `, ${failed.length} failed: ${failed.join(', ')}` : ''}.`);
  process.exit(failed.length && !saved.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
