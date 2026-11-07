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
