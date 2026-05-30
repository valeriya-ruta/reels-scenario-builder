import { test, expect } from '@playwright/test';
import { ACTIVE_STATE, NOSUB_STATE } from './utils/authPaths';
import { watchConsoleErrors } from './utils/consoleErrors';

const hasActive = !!process.env.E2E_ACTIVE_EMAIL && !!process.env.E2E_ACTIVE_PASSWORD;
const hasNoSub = !!process.env.E2E_NOSUB_EMAIL && !!process.env.E2E_NOSUB_PASSWORD;

test.describe('Profile page — user WITH an active subscription', () => {
  test.skip(!hasActive, 'Requires E2E_ACTIVE_* credentials and a seeded subscribed user.');
  test.use({ storageState: ACTIVE_STATE });

  test('renders title, account header, subscription and settings', async ({ page }) => {
    const watcher = watchConsoleErrors(page);
    await page.goto('/profile');

    await expect(page.getByRole('heading', { name: 'Профіль' })).toBeVisible();

    // Account header shows the authenticated user's details.
    const header = page.getByTestId('account-header');
    await expect(header).toBeVisible();
    await expect(page.getByText(process.env.E2E_ACTIVE_EMAIL!, { exact: false })).toBeVisible();
    await expect(page.getByTestId('instagram-handle')).toContainText('@');

    // Subscription renders the ACTIVE state.
    await expect(page.getByTestId('subscription-active')).toBeVisible();
    await expect(page.getByTestId('subscription-active')).toContainText('Активна');
    await expect(page.getByTestId('subscription-none')).toHaveCount(0);

    // Settings list present.
    await expect(page.getByTestId('settings-list')).toBeVisible();

    // No language row anywhere.
    await expect(page.getByText('Мова', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Language', { exact: false })).toHaveCount(0);

    expect(watcher.errors, watcher.errors.join('\n')).toEqual([]);
  });

  test('edit affordance opens the editor', async ({ page }) => {
    await page.goto('/profile');
    await page.getByTestId('edit-profile').click();
    await expect(page.getByTestId('edit-name')).toBeVisible();
    await expect(page.getByTestId('edit-handle')).toBeVisible();
  });

  test('subscription CTA does not trigger a payment navigation', async ({ page }) => {
    await page.goto('/profile');
    await page.getByTestId('manage-subscription').click();
    // Stub only — must stay on the profile route, no payment/checkout redirect.
    await expect(page).toHaveURL(/\/profile/);
  });

  test('branding row opens the existing brand settings', async ({ page }) => {
    await page.goto('/profile');
    await page.getByTestId('branding-row').click();
    await page.waitForURL('**/settings**');
    await expect(page).toHaveURL(/\/settings\?tab=brand/);
  });

  test('Instagram and Сповіщення rows are present and disabled', async ({ page }) => {
    await page.goto('/profile');

    for (const id of ['instagram-row', 'notifications-row']) {
      const row = page.getByTestId(id);
      await expect(row).toBeVisible();
      await expect(row).toHaveAttribute('aria-disabled', 'true');
      // Clicking a disabled row does nothing — no navigation.
      await row.click({ force: true });
      await expect(page).toHaveURL(/\/profile/);
    }
  });

  test('support row opens the support popup', async ({ page }) => {
    await page.goto('/profile');
    await page.getByTestId('support-row').click();
    await expect(page.getByTestId('support-modal')).toBeVisible();
  });

  test('logout signs out and returns to the login screen', async ({ page }) => {
    await page.goto('/profile');
    await page.getByTestId('logout-row').click();
    await page.waitForURL((url) => url.pathname === '/');
    await expect(page.getByRole('heading', { name: 'Ruta' })).toBeVisible();
  });
});

test.describe('Profile page — user WITHOUT a subscription', () => {
  test.skip(!hasNoSub, 'Requires E2E_NOSUB_* credentials and a seeded user with no subscription.');
  test.use({ storageState: NOSUB_STATE });

  test('renders the no-plan state', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByTestId('subscription-none')).toBeVisible();
    await expect(page.getByTestId('subscribe')).toBeVisible();
    await expect(page.getByTestId('subscription-active')).toHaveCount(0);
  });
});
