import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import { AUTH_DIR, seededAccounts } from './utils/authPaths';

/**
 * Authenticated-session fixture.
 *
 * For each seeded test account whose credentials are present in the environment
 * (E2E_ACTIVE_EMAIL/PASSWORD, E2E_NOSUB_EMAIL/PASSWORD), this logs in through
 * the real login UI and saves the resulting Supabase session as a Playwright
 * storage-state file. Authenticated specs then `test.use({ storageState })`.
 *
 * When credentials are absent the step is skipped (not failed) so the public
 * smoke suite still runs with zero setup. See PR notes for the env vars and the
 * seeded-user states required to run the authenticated suites.
 */
setup('authenticate seeded accounts', async ({ browser }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const accounts = seededAccounts().filter((a) => a.email && a.password);

  if (accounts.length === 0) {
    setup.skip(
      true,
      'No E2E_* credentials set — skipping auth setup. Authenticated specs will skip.',
    );
    return;
  }

  for (const account of accounts) {
    const page = await browser.newPage();
    await page.goto('/');

    await page.locator('#email').fill(account.email!);
    await page.locator('#password').fill(account.password!);
    await page.getByRole('button', { name: 'Увійти' }).click();

    // Successful sign-in routes to the dashboard.
    await page.waitForURL('**/dashboard', { timeout: 20_000 });
    await expect(page).toHaveURL(/\/dashboard/);

    await page.context().storageState({ path: account.storageState });
    await page.close();
  }
});
