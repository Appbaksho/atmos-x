import { expect, test, uniqueEmail } from './fixtures';

/** Signed-in, onboarded user at Mohammadpur with a 200 m radius (the server profile wins on load). */
async function onboard(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  await page.goto('/en/auth/register');
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === 'atmos_session')).toBe(true);
  await page.evaluate(async (email) => {
    const h = { 'content-type': 'application/json' };
    await fetch('/api/v1/auth/upgrade', { method: 'POST', headers: h, body: JSON.stringify({ email, password: 'long enough pw', display_name: 'Map Tester' }) });
    await fetch('/api/v1/me/profile', { method: 'PATCH', headers: h, body: JSON.stringify({ onboarded: true, radius_m: 200, home: { lat: 23.759, lng: 90.359 } }) });
  }, await uniqueEmail('map'));
  void request;
}

test('map shows the hex ring count and the zone list matches the zone page (E2, H4)', async ({ page, request }) => {
  await onboard(page, request);
  await page.goto('/en/app/map');
  await expect(page.getByText(/19 hexes · 200 m/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Satellite images/)).toBeVisible();
  const row = page.locator('a[href*="/app/zone/z_"]').first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const href = await row.getAttribute('href');
  const zoneId = href!.split('/app/zone/')[1];
  const api = await page.evaluate(async (id) => (await fetch(`/api/v1/zones/${id}?lang=en`)).json(), zoneId);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/app/zone/${zoneId}`));
  // Names are written once by a worker job; the page shows "Zone N" until then, then the stored name.
  await expect
    .poll(async () => (await page.evaluate(async (id) => (await fetch(`/api/v1/zones/${id}?lang=en`)).json(), zoneId)).name, { timeout: 60_000 })
    .not.toBe('');
  const named = await page.evaluate(async (id) => (await fetch(`/api/v1/zones/${id}?lang=en`)).json(), zoneId);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(named.name, { timeout: 30_000 });
  await expect(page.getByText(String(api.score), { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Landsat/).first()).toBeVisible();
});
