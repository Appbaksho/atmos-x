import { expect, test, uniqueEmail } from './fixtures';

async function session(page: import('@playwright/test').Page, user: boolean) {
  await page.goto('/en/auth/register');
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === 'atmos_session')).toBe(true);
  await page.evaluate(
    async ([email, user]) => {
      const h = { 'content-type': 'application/json' };
      if (user) await fetch('/api/v1/auth/upgrade', { method: 'POST', headers: h, body: JSON.stringify({ email, password: 'long enough pw', display_name: 'Farm Tester' }) });
      await fetch('/api/v1/me/profile', { method: 'PATCH', headers: h, body: JSON.stringify({ onboarded: true, farmer_mode: true, home: { lat: 23.759, lng: 90.359 } }) });
    },
    [await uniqueEmail('farm'), user] as const,
  );
}

test('a saved field gets its alerts from the server (§7.9, F01, F03)', async ({ page }) => {
  await session(page, true);
  const field = await page.evaluate(async () => {
    const r = await fetch('/api/v1/farm/fields', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bund plot', crop: 'boro', stage: 'flowering', location: { lat: 23.759, lng: 90.359 }, area: 1.2 }),
    });
    return r.json();
  });
  expect(field.name).toBe('Bund plot');
  const alerts = await page.evaluate(async (id) => (await fetch(`/api/v1/farm/alerts?field_id=${id}`)).json(), field.id);
  expect(Array.isArray(alerts.alerts)).toBe(true);
  expect(alerts.meta.sources.map((s: { id: string }) => s.id)).toContain('open_meteo');

  await page.goto('/en/app/farm');
  await expect(page).toHaveURL(/\/app\/farm\/fields/);
  await expect(page.getByRole('radio', { name: /Bund plot, 1.2 acres · Boro rice, Flowering/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(`Alerts for this field · ${alerts.alerts.length}`)).toBeVisible({ timeout: 20_000 });
  if (!alerts.alerts.length) await expect(page.getByText('No alerts for this crop and stage in the 7-day forecast.')).toBeVisible();
});

test('guests preview alerts by place but cannot save fields (A7)', async ({ page }) => {
  await session(page, false);
  const r = await page.evaluate(async () => (await fetch('/api/v1/farm/alerts?lat=23.759&lng=90.359&crop=boro&stage=flowering')).status);
  expect(r).toBe(200);
  // page.request shares the browser's cookies without logging a console error for the expected 403.
  const add = await page.request.post('/api/v1/farm/fields', { data: { name: 'x', crop: 'boro', stage: 'flowering', location: { lat: 23.7, lng: 90.3 } } });
  expect([add.status(), (await add.json()).code]).toEqual([403, 'auth.guest_restricted']);
  await page.goto('/en/app/farm/fields');
  await expect(page.getByText('Guests can preview alerts for any crop. Create a free account to save fields.')).toBeVisible({ timeout: 20_000 });
});
