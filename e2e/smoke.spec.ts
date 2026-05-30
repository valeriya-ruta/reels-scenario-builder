import { test, expect } from '@playwright/test';
import { watchConsoleErrors } from './utils/consoleErrors';

/**
 * Foundation smoke test. Loads the app's public entry route and asserts it
 * renders without uncaught console errors. Requires no authentication, so it
 * runs green in any environment with the dev server up.
 */
test('main entry route renders without console errors', async ({ page }) => {
  const watcher = watchConsoleErrors(page);

  await page.goto('/');

  // The login screen renders the "Ruta" wordmark heading.
  await expect(page.getByRole('heading', { name: 'Ruta' })).toBeVisible();

  expect(watcher.errors, watcher.errors.join('\n')).toEqual([]);
});
