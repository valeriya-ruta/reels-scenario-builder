import { test, expect } from '@playwright/test';
import { ACTIVE_STATE } from './utils/authPaths';
import { watchConsoleErrors } from './utils/consoleErrors';

/**
 * Create radial menu (task 86d35yfxw). Tap-to-open → tap-option is the
 * guaranteed core path verified here. Authenticated; skips without E2E creds.
 */
const hasActive = !!process.env.E2E_ACTIVE_EMAIL && !!process.env.E2E_ACTIVE_PASSWORD;

test.describe('Create radial menu', () => {
  test.skip(!hasActive, 'Requires E2E_ACTIVE_* credentials and a seeded authenticated user.');
  test.use({ storageState: ACTIVE_STATE });

  const openMenu = async (page: import('@playwright/test').Page) => {
    await page.goto('/dashboard');
    const fab = page.getByTestId('create-fab');
    await fab.click();
    await expect(page.getByTestId('radial-menu')).toBeVisible();
    return fab;
  };

  test('opens with 4 options and the FAB becomes ×', async ({ page }) => {
    const fab = await openMenu(page);
    for (const id of ['reels', 'carousel', 'stories', 'ideas']) {
      await expect(page.getByTestId(`radial-option-${id}`)).toBeVisible();
    }
    await expect(fab).toHaveAttribute('aria-label', 'Закрити');
    await expect(fab).toHaveAttribute('aria-expanded', 'true');
  });

  test('× / backdrop dismiss the menu', async ({ page }) => {
    const fab = await openMenu(page);
    await fab.click(); // FAB now acts as ×
    await expect(page.getByTestId('radial-menu')).toHaveCount(0);

    await openMenu(page);
    await page.getByTestId('radial-backdrop').click();
    await expect(page.getByTestId('radial-menu')).toHaveCount(0);
  });

  test('Рілс / Карусель / Сторіс route to their creation flows', async ({ page }) => {
    const routes: Record<string, RegExp> = {
      reels: /\/projects/,
      carousel: /\/carousel/,
      stories: /\/storytellings/,
    };
    for (const [id, url] of Object.entries(routes)) {
      await openMenu(page);
      await page.getByTestId(`radial-option-${id}`).click();
      await expect(page).toHaveURL(url);
    }
  });

  test('Ідеї opens the braindump overlay without navigating', async ({ page }) => {
    const watcher = watchConsoleErrors(page);
    await openMenu(page);
    await page.getByTestId('radial-option-ideas').click();
    await expect(page.getByTestId('braindump-overlay')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard/);
    expect(watcher.errors, watcher.errors.join('\n')).toEqual([]);
  });
});
