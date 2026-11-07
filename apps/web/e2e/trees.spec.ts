import { expect, test, uniqueEmail } from './fixtures';

/** A small green JPEG made in the page (so the photo passes the rough "enough green" check). */
async function greenJpeg(page: import('@playwright/test').Page, seed: number): Promise<Buffer> {
  const b64 = await page.evaluate(async (s) => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 240;
    const g = c.getContext('2d')!;
    let x = s * 9301 + 49297;
    for (let i = 0; i < 24; i++)
      for (let j = 0; j < 24; j++) {
        x = (x * 9301 + 49297) % 233280;
        g.fillStyle = `rgb(${20 + (x % 60)}, ${120 + (x % 120)}, ${20 + ((x >> 3) % 50)})`;
        g.fillRect(i * 10, j * 10, 10, 10);
      }
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let out = '';
    for (const v of buf) out += String.fromCharCode(v);
    return btoa(out);
  }, seed);
  return Buffer.from(b64, 'base64');
}

async function asUser(page: import('@playwright/test').Page) {
  await page.goto('/en/auth/register');
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === 'atmos_session')).toBe(true);
  await page.evaluate(async (email) => {
    const h = { 'content-type': 'application/json' };
    await fetch('/api/v1/auth/upgrade', { method: 'POST', headers: h, body: JSON.stringify({ email, password: 'long enough pw', display_name: 'Tree Tester' }) });
    await fetch('/api/v1/me/profile', { method: 'PATCH', headers: h, body: JSON.stringify({ onboarded: true, radius_m: 200, home: { lat: 23.759, lng: 90.359 } }) });
  }, await uniqueEmail('trees'));
}

/** The in-app camera falls back to the file picker when there is no camera; feed it a photo. */
async function shoot(page: import('@playwright/test').Page, seed: number) {
  const input = page.locator('input[type="file"][accept="image/*"]');
  await expect(input).toBeAttached();
  await input.setInputFiles({ name: `p${seed}.jpg`, mimeType: 'image/jpeg', buffer: await greenJpeg(page, seed) });
  await page.getByRole('button', { name: 'Use photo' }).click();
}

test('log a planting, see it in My trees and check in (S14, T1–T6, §7.11)', async ({ page }) => {
  await asUser(page);
  await page.goto('/en/app/log-action?type=plant_tree');
  await page.getByRole('button', { name: 'Open camera' }).click();
  await shoot(page, 1);
  await page.getByLabel('Nickname').fill('Corner neem');
  await page.getByRole('button', { name: 'Submit for verification' }).click();
  // A gallery photo without EXIF can't prove when and where it was taken: it waits for a review.
  await expect(page.getByText('Checks')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Taken with the camera')).toBeVisible();
  await expect(page.getByText(/We couldn’t confirm when and where this photo was taken/).first()).toBeVisible();

  await page.goto('/en/app/tree');
  await expect(page.getByRole('heading', { name: 'My trees' })).toBeVisible();
  await expect(page.getByText('Planted', { exact: true })).toBeVisible();
  const tile = page.getByRole('button', { name: 'Corner neem 1, Verifying' });
  await expect(tile).toBeVisible({ timeout: 20_000 });
  await tile.click();
  await expect(page).toHaveURL(/\/app\/tree\/[0-9a-f-]{36}/);
  await expect(page.getByText(/Waiting for the planting to be confirmed/)).toBeVisible();

  await page.getByRole('button', { name: 'Take guided photo' }).click();
  await shoot(page, 2);
  await page.getByRole('radio', { name: /Healthy/ }).click();
  await page.getByLabel('Height in cm (optional)').fill('85');
  await page.getByRole('button', { name: 'Save check-in' }).click();
  await expect(page.getByText('Check-in saved')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('At the tree').or(page.getByText('Photo added')).first()).toBeVisible();
  await expect(page.getByText('85 cm').first()).toBeVisible();
});

test('My trees and a tree link ask guests to create an account (A7)', async ({ page }) => {
  await page.goto('/en/auth/register');
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === 'atmos_session')).toBe(true);
  await page.goto('/en/app/tree');
  await expect(page.getByRole('main').getByText(/Create a free account to track your trees|guest/i).first()).toBeVisible();
  await page.goto('/en/app/tree/join?t=not-a-token');
  await expect(page.getByText('Create an account to help')).toBeVisible();
});
