import { expect, test } from './fixtures';

test('navigation: tabs, Log action, avatar menu and sidebar (N1–N3)', async ({ page }, info) => {
  await page.goto('/en/app/community?demo=1');
  const nav = page.getByRole('navigation', { name: 'Main' });
  if (info.project.name.includes('mobile')) {
    const bar = page.locator('nav.cz-tabbar');
    await expect(bar.getByRole('link')).toHaveText(['Home', 'Map', 'Plan', 'My trees', 'Community', '']);
    await expect(bar.getByRole('link', { name: 'Log action' })).toHaveAttribute('href', /\/app\/log-action$/);
    await page.getByRole('button', { name: /^Menu/ }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('link', { name: 'Store' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Profile' })).toBeVisible();
    await sheet.getByRole('link', { name: 'Store' }).click();
    await expect(page).toHaveURL(/\/app\/store$/);
  } else {
    const side = nav.filter({ has: page.getByRole('link', { name: 'Store' }) }).first();
    const labels = await side.getByRole('link').allTextContents();
    expect(labels.slice(0, 8)).toEqual(['Log action', 'Home', 'Map', 'Plan', 'My trees', 'Community', 'Store', 'Farm']);
    await side.getByRole('link', { name: 'My trees' }).click();
    await expect(page).toHaveURL(/\/app\/tree$/);
    await expect(page.getByRole('heading', { name: 'My trees' })).toBeVisible();
  }
});
