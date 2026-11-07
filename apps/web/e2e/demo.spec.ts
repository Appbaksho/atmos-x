import { expect, test } from './fixtures';

/**
 * prompt-v1 §13.3 demo script, in Bangla, end to end through the Next origin with the worker running.
 * Step 8 (the camera) is covered with a file upload in trees.spec.ts; installing the PWA is checked
 * through the manifest (the service worker registers only in production builds).
 */
test.use({ geolocation: { latitude: 23.7639, longitude: 90.3589 }, permissions: ['geolocation'], locale: 'bn-BD', timezoneId: 'Asia/Dhaka' });

const bnDigits = (n: number | string) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);

test('demo script in Bangla: onboarding, live Dhaka, map scans, zone, plan, trees, community, store, air, farmer (§13.3)', async ({ page }) => {
  test.setTimeout(180_000);

  // 1. Installable: manifest with standalone display.
  await page.goto('/');
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  expect(manifest.display).toBe('standalone');

  // 2. Onboard in বাংলা; location comes right after language.
  await page.goto('/app/onboarding/welcome');
  await page.locator('a[href$="/app/onboarding/language"]').first().click();
  await page.getByRole('radio', { name: /^বাংলা/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await page.locator('a[href$="/app/onboarding/location"]').click();
  await expect(page).toHaveURL(/\/bn\/app\/onboarding\/location/);
  await page.getByRole('button', { name: 'আমার অবস্থান ব্যবহার করুন' }).click();
  await page.getByRole('button', { name: /স্ক্যান করুন/ }).click();

  // 3. Home shows Dhaka live, with sources.
  await expect(page).toHaveURL(/\/bn\/app(\/map)?$/, { timeout: 30_000 });
  await page.goto('/bn/app');
  await expect(page.getByText(/Open-Meteo|NASA POWER/).first()).toBeVisible({ timeout: 30_000 });

  // 4. Map: 200 m scan, then 500 m; satellite hexes with Landsat named.
  await page.goto('/bn/app/map');
  await expect(page.getByText(`${bnDigits(19)}টি হেক্স · ${bnDigits(200)} মি`, { exact: false })).toBeVisible({ timeout: 30_000 });
  const s500 = await page.evaluate(async () => (await fetch('/api/v1/zones?lat=23.7639&lng=90.3589&radius_m=500&lang=bn')).json());
  expect(s500.hexes.length).toBe(61);
  expect(s500.meta.sources.map((x: { id: string }) => x.id)).toContain('landsat');

  // 5. The zone: list and detail agree (E2).
  const s200 = await page.evaluate(async () => (await fetch('/api/v1/zones?lat=23.7639&lng=90.3589&radius_m=200&lang=bn')).json());
  const z = s200.zones[0];
  const detail = await page.evaluate(async (id) => (await fetch(`/api/v1/zones/${id}?lang=bn`)).json(), z.id);
  expect([detail.id, detail.score, detail.h3]).toEqual([z.id, z.score, z.h3]);
  await page.goto(`/bn/app/zone/${z.id}`);
  await expect(page.getByText(bnDigits(z.score), { exact: true }).first()).toBeVisible({ timeout: 30_000 });

  // 6–7. Projection ("act vs don't act") for the zone.
  await page.goto(`/bn/app/zone/${z.id}/projection`);
  await expect(page.locator('main')).toBeVisible();

  // 8–11 with the demo story (Nadia): trees, community, store with pending vs spendable.
  await page.goto('/bn/app/tree?demo=1');
  await expect(page.getByText('Arjun').first()).toBeVisible({ timeout: 30_000 });
  await page.goto('/bn/app/community');
  await expect(page.getByText('Asad Gate Crew').first()).toBeVisible({ timeout: 30_000 });
  await page.goto('/bn/app/store');
  const pts = await page.evaluate(async () => (await (await fetch('/api/v1/store/products')).json()).points);
  await expect(page.getByText(bnDigits(pts.spendable), { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(new RegExp(`${bnDigits(pts.pending)} পয়েন্ট অপেক্ষমাণ`)).first()).toBeVisible();

  // 12. Air quality with its source.
  await page.goto('/bn/app/air');
  await expect(page.getByText(/OpenAQ|Open-Meteo|GEOS-CF/).first()).toBeVisible({ timeout: 30_000 });

  // 13. Farmer mode: the farm home with alerts for the place.
  await page.goto('/bn/app/settings');
  await page.getByRole('tab', { name: 'কৃষক', exact: true }).click();
  await expect(page).toHaveURL(/\/bn\/app$/, { timeout: 30_000 });
  const alerts = await page.evaluate(async () => (await fetch('/api/v1/farm/alerts?lat=23.7639&lng=90.3589&crop=boro&stage=flowering&lang=bn')).json());
  expect(Array.isArray(alerts.alerts)).toBe(true);
  await expect(page.locator('main')).toBeVisible();
});
