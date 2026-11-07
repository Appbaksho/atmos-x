import { expect, test } from './fixtures';

test('push: Settings explains the state, and the switch stays off without server keys (W2)', async ({ page }) => {
  await page.goto('/en/app/settings');
  const cfg = await page.evaluate(async () => (await (await fetch('/api/v1/push/config')).json()) as { enabled: boolean });
  const sw = page.getByRole('switch', { name: 'Push notifications' });
  await expect(sw).toBeVisible();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  if (!cfg.enabled) {
    await expect(page.getByText("Push isn't set up on this server yet.", { exact: false })).toBeVisible();
    await expect(sw).toHaveAttribute('aria-disabled', 'true');
  }
});
