import { expect, test, uniqueEmail } from './fixtures';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

test('demo: redeem a pilot product for a voucher QR, then see it in My orders (S1–S10)', async ({ page }) => {
  await page.goto('/en/app/store?demo=1');
  await expect(page.getByText('Green Basket (demo pilot)').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Points you can spend')).toBeVisible();
  await expect(page.getByText(/one pilot partner/)).toBeVisible();
  await expect(page.getByText(/Points hold no cash value/).first()).toBeVisible();

  // S4: "Can afford" keeps only what the spendable balance covers.
  await page.getByRole('checkbox', { name: 'Can afford' }).click();
  await expect(page.getByRole('link', { name: /Mango juice/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Seedling starter kit/ })).toHaveCount(0);

  // S6–S8: detail → confirm → voucher code + QR.
  await page.getByRole('link', { name: /Mango juice/ }).click();
  await expect(page.getByRole('heading', { name: 'Mango juice, 6 pack' })).toBeVisible();
  await expect(page.getByText('Asad Gate outlet (demo)')).toBeVisible();
  await page.getByRole('button', { name: 'Redeem' }).click();
  await page.getByRole('button', { name: /Spend 180 pts/ }).click();
  await expect(page.getByRole('img', { name: /QR code for voucher/ })).toBeVisible();
  await expect(page.getByText(/Valid until/)).toBeVisible();

  // S10: the order is listed as ready to collect.
  await page.getByRole('button', { name: 'See my orders' }).click();
  await expect(page.getByText('Ready to collect').first()).toBeVisible();

  // S14: the balance dropped by exactly the price, never below zero.
  const pts = await page.evaluate(async () => (await (await fetch('/api/v1/store/products')).json()).points);
  expect(pts.spendable).toBe(20);
});

test('guest: the store explains how to earn and saplings show the nursery state (S1, S5)', async ({ page }) => {
  await page.goto('/en/app/store');
  await expect(page.getByText('Earn points, then spend them here')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'Buy saplings' }).click();
  await expect(page.getByText(/No nursery sells online near you yet|Neem sapling/).first()).toBeVisible();
  await page.getByRole('tab', { name: 'My orders' }).click();
  await expect(page.getByText('Sign up to redeem products and see your orders')).toBeVisible();
});

test('company: register with documents, wait for review; admin screens stay closed (M1, M2)', async ({ page }) => {
  await page.goto('/en/auth/register');
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === 'atmos_session')).toBe(true);
  const email = await uniqueEmail('co');
  await page.evaluate(async (e) => {
    await fetch('/api/v1/auth/upgrade', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: 'long enough pw', display_name: 'Rafi E2E' }) });
  }, email);

  await page.goto('/en/app/company');
  await expect(page.getByText('Fund trees that are proven alive')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Company name').fill('Riverside Textiles E2E');
  await page.getByLabel('Trade licence number').fill('TRAD/DNCC/0001');
  await page.getByLabel('TIN or BIN', { exact: true }).fill('123456789012');
  await page.getByLabel('Industry').fill('Textiles');
  await page.getByLabel('Contact person').fill('Rafi Ahmed');
  await page.getByLabel('Contact email').fill(email);
  await page.getByLabel(/^Trade licence \(PDF/).setInputFiles({ name: 'licence.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.getByLabel('TIN or BIN certificate').setInputFiles({ name: 'tin.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.getByRole('button', { name: 'Send for review' }).click();
  await expect(page.getByText(/checking your documents/)).toBeVisible();
  await expect(page.getByText('In review')).toBeVisible();

  // Not a partner, not an admin: both screens say so without leaking data.
  await page.goto('/en/app/partner');
  await expect(page.getByText('This is for store partners')).toBeVisible();
  await page.goto('/en/app/admin');
  await expect(page.getByText('Admins only')).toBeVisible();
});
