import { test as base, expect, type Page } from '@playwright/test';

/** Fails the test on any console error or failed same-origin request (prompt-v1 E17). */
export const test = base.extend<{ watch: { errors: string[] } }>({
  watch: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('response', (r) => {
        const url = new URL(r.url());
        if (url.origin === new URL(page.url() || r.url()).origin && r.status() === 404 && !url.pathname.startsWith('/api/v1/zones/')) {
          errors.push(`404: ${url.pathname}`);
        }
      });
      await use({ errors });
      expect(errors, errors.join('\n')).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function uniqueEmail(prefix = 'e2e'): Promise<string> {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.org`;
}

export async function apiJson(page: Page, path: string) {
  return page.evaluate(async (p) => (await fetch(p, { credentials: 'same-origin' })).json(), path);
}
