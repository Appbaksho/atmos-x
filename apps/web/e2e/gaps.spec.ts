import { expect, test } from './fixtures';

test('a tree shows its cooling estimate and can be shared as a post (T5, C14)', async ({ page }) => {
  await page.goto('/en/app/tree?demo=1');
  await page.getByRole('button', { name: /Arjun/ }).first().click();
  await expect(page).toHaveURL(/\/app\/tree\/.+/);
  await expect(page.getByText('Cooling from this tree (estimate)')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Share as a post' }).click();
  await expect(page.getByLabel('Say something (optional)')).toHaveValue(/My tree .+ is growing!/);
  await page.getByRole('dialog').getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/post\/.+/, { timeout: 30_000 });
});

test('My teams has an invites section (P3)', async ({ page }) => {
  await page.goto('/en/app/team?demo=1');
  await expect(page.getByText('Invites', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByPlaceholder(/K7Q29|e\.g\./i).first()).toBeVisible();
});
