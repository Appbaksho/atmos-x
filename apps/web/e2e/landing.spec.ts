import { expect, test } from './fixtures';

test('landing: hero, live NASA sources, hreflang, sitemap and robots (W1)', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Cool your neighbourhood, block by block' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the app' }).first()).toHaveAttribute('href', '/app');
  await expect(page.getByRole('link', { name: 'Try the Dhaka demo' })).toHaveAttribute('href', '/app?demo=1');
  for (const h of ['The problem', 'How it works', 'NASA data in use', 'What you can do', 'Science notes']) await expect(page.getByRole('heading', { level: 2, name: h })).toBeVisible();
  // The NASA list is read from GET /sources, not written into the page.
  const live = await page.evaluate(async () => (await (await fetch('/api/v1/sources')).json()).active_nasa_count as number);
  await expect(page.getByText(`${live} NASA datasets in use right now`)).toBeVisible();
  await expect(page.locator('#data').getByText(/Landsat/).first()).toBeVisible();
  await expect(page.locator('head link[rel="alternate"][hreflang="bn"]')).toHaveAttribute('href', /\/bn$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain('hreflang="ur"');
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('Disallow: /api/');
});

test('landing in Urdu is right to left', async ({ page }) => {
  await page.goto('/ur');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
