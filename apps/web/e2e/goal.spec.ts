import { expect, test, uniqueEmail } from './fixtures';

async function asUser(page: import('@playwright/test').Page, guest = false) {
  await page.goto('/en/auth/register');
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === 'atmos_session')).toBe(true);
  await page.evaluate(
    async ([email, guest]) => {
      const h = { 'content-type': 'application/json' };
      if (!guest) await fetch('/api/v1/auth/upgrade', { method: 'POST', headers: h, body: JSON.stringify({ email, password: 'long enough pw', display_name: 'Goal Tester' }) });
      await fetch('/api/v1/me/profile', { method: 'PATCH', headers: h, body: JSON.stringify({ onboarded: true, radius_m: 200, home: { lat: 23.759, lng: 90.359 } }) });
    },
    [await uniqueEmail('goal'), guest] as const,
  );
}

async function firstZone(page: import('@playwright/test').Page): Promise<string> {
  const scan = await page.evaluate(async () => (await fetch('/api/v1/zones?lat=23.759&lng=90.359&radius_m=200&lang=en')).json());
  return scan.zones[0].id as string;
}

test('a user sets a goal from a zone and sees it in My goals (G1–G4, P2)', async ({ page }) => {
  await asUser(page);
  const zoneId = await firstZone(page);
  await page.goto(`/en/app/goal/new?zone=${zoneId}`);
  await expect(page.getByText(/recommended|realistic|Checking what this space/i).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Check feasibility/i }).click();
  await expect(page).toHaveURL(/\/app\/goal\/.+\/feasibility/, { timeout: 30_000 });
  await page.goto('/en/app/goal');
  await expect(page.getByRole('heading', { name: 'My goals' })).toBeVisible();
  await expect(page.getByText(/Action goal|Cooling goal/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Next task')).toBeVisible();
});

test('a guest gets the account sheet and the draft is kept (E4, G5)', async ({ page }) => {
  await asUser(page, true);
  const zoneId = await firstZone(page);
  await page.goto(`/en/app/goal/new?zone=${zoneId}`);
  await page.getByRole('button', { name: /Check feasibility/i }).click();
  await expect(page.getByText(/Create a free account/i).first()).toBeVisible();
  // The draft is saved in the background when the account sheet opens.
  await expect.poll(async () => (await page.evaluate(async () => (await fetch('/api/v1/goal-drafts')).json()))?.payload?.zone_id).toBe(zoneId);
});

test('parent routes work (P2, P5, P6, P7)', async ({ page }) => {
  await asUser(page);
  for (const [path, expectUrl] of [
    ['/en/app/goal', /\/app\/goal$/],
    ['/en/app/farm', /\/app\/farm\/fields/],
    ['/en/app/species', /\/app\/species$/],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveURL(expectUrl);
  }
  await expect(page.getByText('Neem').first()).toBeVisible({ timeout: 20_000 });
  // Last: the map keeps loading tiles, so the test ends there instead of navigating away mid-request.
  await page.goto('/en/app/zone');
  await expect(page).toHaveURL(/\/app\/map/);
  await expect(page.getByText(/hexes · 200 m/)).toBeVisible({ timeout: 30_000 });
});
