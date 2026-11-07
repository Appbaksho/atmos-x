import { expect, test, uniqueEmail } from './fixtures';

async function asUser(page: import('@playwright/test').Page, locale = 'en') {
  await page.goto(`/${locale}/auth/register`);
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === 'atmos_session')).toBe(true);
  await page.evaluate(async (email) => {
    const h = { 'content-type': 'application/json' };
    await fetch('/api/v1/auth/upgrade', { method: 'POST', headers: h, body: JSON.stringify({ email, password: 'long enough pw', display_name: 'Ask Tester' }) });
    await fetch('/api/v1/me/profile', { method: 'PATCH', headers: h, body: JSON.stringify({ onboarded: true, radius_m: 200, home: { lat: 23.759, lng: 90.359 } }) });
  }, await uniqueEmail('ask'));
}

test('a suggestion chip answers with real numbers and sources (K1–K4)', async ({ page }) => {
  await asUser(page);
  await page.goto('/en/app/map');
  await page.getByRole('button', { name: 'Ask Atmos' }).first().click();
  await page.getByRole('button', { name: 'How hot is it now?' }).click();
  await expect(page.getByText(/It is [\d.,]+ °C now and feels like [\d.,]+ °C/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /Open-Meteo/ }).last()).toBeVisible();
  // Follow-up chips come back with the answer.
  await expect(page.getByRole('button', { name: 'Why is it so hot here?' }).last()).toBeVisible();
});

test('Bangla: "আমার এলাকা এত গরম কেন?" gets a Bangla answer with numbers in under 2 s (acceptance 14)', async ({ page }) => {
  await asUser(page, 'bn');
  await page.goto('/bn/app/map');
  await page.getByRole('button', { name: 'Ask Atmos' }).first().click();
  const box = page.locator('input.cz-ask-input');
  await box.fill('আমার এলাকা এত গরম কেন?');
  const t0 = Date.now();
  await box.press('Enter');
  await expect(page.getByText(/হিট স্কোর|স্ক্যান হয়নি/)).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - t0).toBeLessThan(2_000);
  await expect(page.getByText(/[০-৯]/).first()).toBeVisible(); // native digits
});
