import { expect, test } from './fixtures';

test('About is built from /sources and has no AI or v0 copy (E6, E14, K9)', async ({ page }) => {
  await page.goto('/en/app/about');
  const live = await page.evaluate(async () => (await (await fetch('/api/v1/sources')).json()) as { active_nasa_count: number; sources: { name: string }[] });
  await expect(page.getByText(`${live.active_nasa_count} NASA datasets in use right now`)).toBeVisible();
  await expect(page.getByText(live.sources[0].name).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How actions are checked' })).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\bAI\b|OpenAI|\bv0\b|never sells|not satellite data/);
  expect(text).toContain('Partner nurseries can sell saplings');
});
