import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Reels Planner (Next.js) app.
 *
 * Browser: by default Playwright uses its own managed Chromium
 * (`npx playwright install chromium`). In restricted environments where the
 * Playwright browser CDN is blocked, point Playwright at an existing Chrome
 * build via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (and set
 * `PLAYWRIGHT_CHROMIUM_NO_SANDBOX=1` when running as root). See README / PR notes.
 *
 * Auth: authenticated suites rely on storage-state files produced by
 * `e2e/auth.setup.ts`, which logs in seeded test users using the
 * `E2E_*` env vars. When those env vars are absent the setup is skipped and
 * the authenticated specs skip themselves, so the public smoke test still runs
 * green with zero configuration.
 */

const PORT = 3001;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const launchArgs = process.env.PLAYWRIGHT_CHROMIUM_NO_SANDBOX ? ['--no-sandbox'] : [];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL,
    trace: 'on-first-retry',
    launchOptions: { executablePath, args: launchArgs },
  },

  projects: [
    // Logs in seeded test users and writes storage-state files. Skips cleanly
    // when E2E_* credentials are not configured.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // Mobile-first project — the app (and the floating bottom nav) is designed
    // mobile-first, so destination/nav specs run against a phone viewport.
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
