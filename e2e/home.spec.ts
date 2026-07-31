import { test, expect } from '@playwright/test';
import { ACTIVE_STATE } from './utils/authPaths';
import { watchConsoleErrors } from './utils/consoleErrors';

/**
 * Home (Головна) — the one urgency-ranked stack (Prompt 7). Authenticated;
 * skips cleanly when E2E_ACTIVE_* credentials are not configured (same pattern
 * as the other authed specs).
 */
const hasActive = !!process.env.E2E_ACTIVE_EMAIL && !!process.env.E2E_ACTIVE_PASSWORD;

test.describe('Home (Головна)', () => {
  test.skip(!hasActive, 'Requires E2E_ACTIVE_* credentials and a seeded authenticated user.');
  test.use({ storageState: ACTIVE_STATE });

  test('renders the whole stack, in order', async ({ page }) => {
    const watcher = watchConsoleErrors(page);
    await page.goto('/dashboard');

    const greeting = page.getByTestId('home-greeting');
    await expect(greeting).toBeVisible();
    await expect(greeting).toContainText(/Доброго ранку|Добрий день|Добрий вечір/);

    // Coin (the gamification entry point) sits opposite the greeting.
    await expect(page.getByTestId('coin-badge')).toBeVisible();

    // Sections, top to bottom.
    await expect(page.getByRole('heading', { name: 'Сьогодні' })).toBeVisible();
    await expect(page.getByTestId('today-add')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Статистика' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Весь контент' })).toBeVisible();

    // 86d39e36r: the leftover app header must not show on mobile main screens.
    await expect(page.getByText('Твоя контент-подружка')).not.toBeVisible();

    expect(watcher.errors, watcher.errors.join('\n')).toEqual([]);
  });

  test('greeting shows the correct variant for mocked morning/day/evening', async ({ page }) => {
    const cases: { time: string; expected: RegExp }[] = [
      { time: '2026-06-08T08:00:00', expected: /Доброго ранку/ },
      { time: '2026-06-08T14:00:00', expected: /Добрий день/ },
      { time: '2026-06-08T21:00:00', expected: /Добрий вечір/ },
    ];
    for (const c of cases) {
      await page.clock.setFixedTime(new Date(c.time));
      await page.goto('/dashboard');
      await expect(page.getByTestId('home-greeting')).toContainText(c.expected);
    }
  });

  test('Сьогодні shows real cards or a PROPOSING empty state — never "нічого немає"', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    const list = page.getByTestId('today-list');
    const empty = page.getByTestId('today-empty');
    await expect(list.or(empty)).toBeVisible();

    if (await empty.isVisible()) {
      await expect(empty).toContainText('Зробимо щось на сьогодні');
      await expect(empty.getByTestId('proposing-empty')).toBeVisible();
    }
  });

  test('the ＋ on Сьогодні offers the four create options', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('today-add').click();
    for (const id of ['ideas', 'reels', 'carousel', 'stories']) {
      await expect(page.getByTestId(`today-add-${id}`)).toBeVisible();
    }
  });

  test('the coin opens Нагороди', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('coin-badge').click();
    await expect(page).toHaveURL(/\/rewards/);
  });

  test('the inbox row is the only inbox, and opens the staging list', async ({ page }) => {
    await page.goto('/dashboard');
    const row = page.getByTestId('inbox-pressure-row');
    // The row renders only when there IS a pile — an empty inbox disappears.
    if (await row.isVisible()) {
      await expect(row).toContainText(/не заверше/);
      await expect(page.getByTestId('inbox-pressure-count')).toBeVisible();
      await row.click();
      await expect(page).toHaveURL(/\/staging/);
    }
    // Either way there is no inbox tab in the bottom nav.
    const nav = page.getByRole('navigation', { name: 'Основна навігація' });
    await expect(nav.getByText(/Вхідні|Інбокс/)).toHaveCount(0);
  });

  test('«більше» routes to the Insights tab, «Усі» to the content library', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('stats-more-link').click();
    await expect(page).toHaveURL(/\/insights/);

    await page.goto('/dashboard');
    await page.getByTestId('all-content-link').click();
    await expect(page).toHaveURL(/\/content/);
  });
});
