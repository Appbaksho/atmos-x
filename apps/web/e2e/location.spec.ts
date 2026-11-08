import { expect, test } from './fixtures';

/**
 * L8, L11: no silent default place. With location not shared and no city from the IP address
 * (localhost), screens that need a place ask for one; a searched city resolves it and is kept.
 */
test.use({ permissions: [] });

test('without a place the app asks for one; a searched city resolves it (L8, L11)', async ({ page }) => {
  await page.goto('/en/app/map');
  await expect(page.getByRole('heading', { name: 'Where should Atmos X look?' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Try the Dhaka demo instead' })).toHaveAttribute('href', /demo=1/);
  // Screens that don't need a place still open.
  await page.goto('/en/app/about');
  await expect(page.getByRole('heading', { name: 'Data & science' })).toBeVisible();

  await page.goto('/en/app/map');
  await page.getByRole('combobox').fill('Dhanmondi');
  await page.getByRole('option').first().getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Where should Atmos X look?' })).toHaveCount(0);
  await expect(page.getByText(/hexes ·/)).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByText(/hexes ·/)).toBeVisible({ timeout: 30_000 });
});

test('onboarding without a place asks for one instead of scanning a made-up point', async ({ page }) => {
  await page.goto('/en/app/onboarding/location');
  await expect(page.getByRole('heading', { name: 'Where should Atmos X look?' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /^Scan / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible();

  // A searched place unlocks the scan, and the scan lands on Home with data, not on the location gate.
  await page.getByRole('combobox').fill('Dhanmondi');
  await page.getByRole('option').first().getByRole('button').click();
  await page.getByRole('button', { name: /^Scan / }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Where should Atmos X look?' })).toHaveCount(0);
});

test('the location gate’s Dhaka demo link opens the demo from Home', async ({ page }) => {
  // An onboarded guest with no place lands on Home's location gate (as after a scan used to).
  const guest = page.waitForResponse((r) => r.url().includes('/api/v1/auth/guest') && r.ok());
  await page.goto('/en/app/about');
  await guest;
  await page.evaluate(() => fetch('/api/v1/me/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ onboarded: true }) }));
  // Pull the onboarded server profile into the device prefs before opening Home.
  const synced = page.waitForResponse((r) => r.url().includes('/api/v1/me/profile') && r.request().method() === 'GET' && r.ok());
  await page.goto('/en/app/about');
  await synced;
  await page.goto('/en/app');
  await expect(page.getByRole('heading', { name: 'Where should Atmos X look?' })).toBeVisible({ timeout: 30_000 });
  // Same path, only `?demo=1` changes: the mounted shell never re-read it, so the gate stayed up.
  await page.getByRole('link', { name: 'Try the Dhaka demo instead' }).click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.getByText('Air temperature').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Where should Atmos X look?' })).toHaveCount(0);
});
