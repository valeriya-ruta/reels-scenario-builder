import { test, expect } from '@playwright/test';
import { ACTIVE_STATE } from './utils/authPaths';
import { watchConsoleErrors } from './utils/consoleErrors';

const ACCENT_RGB = 'rgb(0, 75, 168)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const hasActive = !!process.env.E2E_ACTIVE_EMAIL && !!process.env.E2E_ACTIVE_PASSWORD;

const DESTINATIONS = [
  { label: 'Головна', href: '/dashboard' },
  { label: 'План', href: '/plan' },
  { label: 'Аналіз', href: '/competitor-analysis' },
  { label: 'Профіль', href: '/profile' },
];

test.describe('floating bottom nav', () => {
  test.skip(!hasActive, 'Requires E2E_ACTIVE_* credentials and a seeded authenticated user.');
  test.use({ storageState: ACTIVE_STATE });

  test('renders on all four destination pages', async ({ page }) => {
    for (const dest of DESTINATIONS) {
      await page.goto(dest.href);
      const nav = page.getByRole('navigation', { name: 'Основна навігація' });
      await expect(nav).toBeVisible();
      for (const d of DESTINATIONS) {
        await expect(nav.getByRole('link', { name: d.label })).toBeVisible();
      }
      await expect(nav.getByTestId('create-fab')).toBeVisible();
    }
  });

  test('each tab navigates and sets the active blue state (icon+label only, no pill)', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    const nav = page.getByRole('navigation', { name: 'Основна навігація' });

    for (const dest of DESTINATIONS) {
      await nav.getByRole('link', { name: dest.label }).click();
      await page.waitForURL(`**${dest.href}`);

      const activeLink = nav.getByRole('link', { name: dest.label });
      await expect(activeLink).toHaveAttribute('data-active', 'true');
      await expect(activeLink).toHaveAttribute('aria-current', 'page');

      // Active label is colored with the brand blue, with no tinted pill behind it.
      await expect(activeLink).toHaveCSS('color', ACCENT_RGB);
      await expect(activeLink).toHaveCSS('background-color', TRANSPARENT);

      // The other tabs are not active.
      for (const other of DESTINATIONS.filter((d) => d.href !== dest.href)) {
        await expect(nav.getByRole('link', { name: other.label })).toHaveAttribute(
          'data-active',
          'false',
        );
      }
    }
  });

  test('center Create FAB opens the create menu', async ({ page }) => {
    await page.goto('/dashboard');
    const nav = page.getByRole('navigation', { name: 'Основна навігація' });
    const fab = nav.getByTestId('create-fab');

    await expect(fab).toBeVisible();
    await expect(page.getByTestId('create-menu')).toHaveCount(0);

    await fab.click();
    const menu = page.getByTestId('create-menu');
    await expect(menu).toBeVisible();
    // Interim menu keeps mobile access to the content lists.
    await expect(menu.getByRole('menuitem', { name: 'Рілси' })).toBeVisible();
  });

  test('navigating across destinations produces no console errors', async ({ page }) => {
    const watcher = watchConsoleErrors(page);
    for (const dest of DESTINATIONS) {
      await page.goto(dest.href);
      await expect(page.getByRole('navigation', { name: 'Основна навігація' })).toBeVisible();
    }
    expect(watcher.errors, watcher.errors.join('\n')).toEqual([]);
  });
});
