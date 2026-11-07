import { expect, test } from './fixtures';

/**
 * Offline shell (prompt-v1 Stage 8): with the service worker installed, a visited page still opens
 * with the network off, and an unvisited one falls back to the cached app shell (or /offline.html). The worker registers only
 * in production builds, so this runs against `next start` (E2E_BASE_URL) and skips on `next dev`.
 */
test('the app shell opens offline once the service worker is installed', async ({ page, context, watch }) => {
  await page.goto('/en/app/about');
  const hasWorker = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const ready = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 8000))]);
    return ready;
  });
  test.skip(!hasWorker, 'The service worker registers only in production builds');
  // The first load is not controlled yet; reload once so the worker caches this page.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Data & science' })).toBeVisible();

  // Requests that fail while offline are expected; only errors from before this point count.
  const before = watch.errors.length;
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Data & science' })).toBeVisible();
  // An unvisited page gets the cached app shell, or /offline.html: never the browser's error page.
  await page.goto('/en/app/never-visited-page');
  await expect(page).toHaveTitle(/Atmos X|Offline/);
  await context.setOffline(false);
  watch.errors.splice(before);
});
