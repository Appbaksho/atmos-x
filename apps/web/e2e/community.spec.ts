import type { Browser, Page } from '@playwright/test';

import { expect, test, uniqueEmail } from './fixtures';

async function newUser(browser: Browser, name: string): Promise<Page> {
  const ctx = await browser.newContext({ geolocation: { latitude: 23.759, longitude: 90.359 }, permissions: ['geolocation'], locale: 'en-US', timezoneId: 'Asia/Dhaka' });
  const page = await ctx.newPage();
  await page.goto('/en/auth/register');
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === 'atmos_session')).toBe(true);
  await page.evaluate(
    async ([email, name]) => {
      const h = { 'content-type': 'application/json' };
      await fetch('/api/v1/auth/upgrade', { method: 'POST', headers: h, body: JSON.stringify({ email, password: 'long enough pw', display_name: name }) });
      await fetch('/api/v1/me/profile', { method: 'PATCH', headers: h, body: JSON.stringify({ onboarded: true, radius_m: 200, area: 'Mohammadpur', home: { lat: 23.759, lng: 90.359 } }) });
    },
    [await uniqueEmail('comm'), name] as const,
  );
  return page;
}

test('join by invite code, chat, post and like (C6, C8)', async ({ browser }) => {
  const a = await newUser(browser, 'Asha E2E');
  const b = await newUser(browser, 'Babul E2E');
  const team = await a.evaluate(async () => {
    const r = await fetch('/api/v1/teams', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Lane Greeners E2E', is_public: false }) });
    return r.json();
  });

  // B joins through the invite page.
  await b.goto(`/en/join/${team.code}`);
  await b.getByRole('button', { name: 'Join Lane Greeners E2E' }).click();
  await expect(b).toHaveURL(new RegExp(`/app/team/${team.id}`), { timeout: 20_000 });
  await expect(b.getByText('Team chat')).toBeVisible();

  // A writes in the chat; B sees it within a poll.
  await a.goto(`/en/app/team/${team.id}`);
  await a.getByLabel('Message your team').fill('Water the neem at 6?');
  await a.getByRole('button', { name: 'Send' }).click();
  await expect(b.getByText('Water the neem at 6?')).toBeVisible({ timeout: 15_000 });

  // A posts on the feed; B likes it; A gets a notification.
  await a.goto('/en/app/community');
  await a.getByLabel('Share what you did or ask your neighbours').fill('Planted three neem saplings today');
  await a.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(a.getByText('Planted three neem saplings today').first()).toBeVisible({ timeout: 15_000 });
  await b.goto('/en/app/community');
  await expect(b.getByText('Planted three neem saplings today').first()).toBeVisible({ timeout: 15_000 });
  await b.getByRole('button', { name: 'Like' }).first().click();
  await expect.poll(async () => (await a.evaluate(async () => (await (await fetch('/api/v1/notifications')).json()).items.map((n: { kind: string }) => n.kind)))).toContain('like');

  // E16: the author's name opens their public profile.
  await b.getByRole('button', { name: 'Asha E2E' }).first().click();
  await expect(b).toHaveURL(/\/app\/u\//);
  await expect(b.getByRole('heading', { name: 'Asha E2E' })).toBeVisible();
  await a.context().close();
  await b.context().close();
});

test('demo mode shows only the invented demo community (§8.4, E5)', async ({ page }) => {
  // "Try the Dhaka demo" = ?demo=1: Presentation mode backed by a server demo user.
  await page.goto('/en/app/community?demo=1');
  await expect(page.getByText('Ward 7 Volunteers').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Lane planting drive').first()).toBeVisible();
  const board = await page.evaluate(async () => (await (await fetch('/api/v1/leaderboard?subject=team&scope=area&period=all')).json()).rows.map((x: { name: string }) => x.name));
  expect(board).toContain('Ward 7 Volunteers');
  for (const real of ['BRAC', 'BUET', 'DNCC', 'Bidyanondo']) expect(board.join(' ')).not.toContain(real);
});
