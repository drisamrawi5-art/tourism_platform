import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e configuration.
 *
 * Requirements (see docs/testing.md):
 * - embedded Postgres running (`npm run db:start`) and the dev database seeded
 * - the Next dev server serves the app; `webServer` starts it when nothing
 *   listens on :3000 and reuses an existing one otherwise
 *
 * Specs live in `tests/e2e/*.spec.ts` (vitest only picks up `*.test.ts`,
 * so the two runners never overlap).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/en',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
