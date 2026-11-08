import { apiJson, expect, test, uniqueEmail } from './fixtures';

test('guest upgrades in place through the sign-up form', async ({ page }) => {
  await page.goto('/en/auth/register');
  // a server guest exists once the page has loaded the session
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === 'atmos_session')).toBe(true);
  expect((await apiJson(page, '/api/v1/auth/me')).role).toBe('guest');
  const guestId = (await apiJson(page, '/api/v1/auth/me')).id;
  await page.getByLabel('Name').fill('Playwright Nadia');
  await page.getByLabel('Email').fill(await uniqueEmail());
  await page.getByLabel('Password', { exact: true }).fill('long enough pw');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app/);
  const me = await apiJson(page, '/api/v1/auth/me');
  expect(me.role).toBe('user');
  expect(me.id).toBe(guestId);
  expect(me.display_name).toBe('Playwright Nadia');
});

test('a signed-in, onboarded person on a new device goes to Home, not onboarding', async ({ browser, request }) => {
  const email = await uniqueEmail('newdevice');
  const r = await request.post('/api/v1/auth/register', { data: { email, password: 'long enough pw', display_name: 'Tania' } });
  expect(r.ok()).toBeTruthy();
  expect((await request.patch('/api/v1/me/profile', { data: { onboarded: true } })).ok()).toBeTruthy();
  // A fresh browser that has only the session cookie: no device prefs, as after iOS clears storage.
  const ctx = await browser.newContext({ geolocation: { latitude: 23.759, longitude: 90.359 }, permissions: ['geolocation'] });
  await ctx.addCookies((await request.storageState()).cookies);
  const page = await ctx.newPage();
  await page.goto('/en/app');
  await expect(page.getByText('Air temperature').first()).toBeVisible({ timeout: 30_000 });
  await expect(page).not.toHaveURL(/onboarding/);
  await ctx.close();
});

test('sign in with email and password', async ({ page, request }) => {
  const email = await uniqueEmail('login');
  const r = await request.post('/api/v1/auth/register', { data: { email, password: 'long enough pw', display_name: 'Rafi' } });
  expect(r.ok()).toBeTruthy();
  await page.context().clearCookies();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('long enough pw');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app/);
  expect((await apiJson(page, '/api/v1/auth/me')).email).toBe(email);
});
