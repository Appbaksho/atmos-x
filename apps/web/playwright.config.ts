import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (prompt-v1 §12 Stage 8). Chromium only. They run against a running stack:
 * `make dev` (API + worker + web). E2E_BASE_URL defaults to the dev server.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'Asia/Dhaka',
    geolocation: { latitude: 23.759, longitude: 90.359 },
    permissions: ['geolocation'],
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 } } },
  ],
});
