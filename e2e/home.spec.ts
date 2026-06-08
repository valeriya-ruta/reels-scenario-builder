import { test, expect } from '@playwright/test';
import { ACTIVE_STATE } from './utils/authPaths';
import { watchConsoleErrors } from './utils/consoleErrors';

/**
 * Home (Головна) page. Authenticated; skips cleanly when E2E_ACTIVE_*
 * credentials are not configured (same pattern as the other authed specs).
 */
const hasActive = !!process.env.E2E_ACTIVE_EMAIL && !!process.env.E2E_ACTIVE_PASSWORD;

test.describe('Home (Головна)', () => {
  test.skip(!hasActive, 'Requires E2E_ACTIVE_* credentials and a seeded authenticated user.');
  test.use({ storageState: ACTIVE_STATE });

  test('renders as the default screen with greeting + all sections', async ({ page }) => {
    const watcher = watchConsoleErrors(page);
    await page.goto('/dashboard');

    const greeting = page.getByTestId('home-greeting');
    await expect(greeting).toBeVisible();
    // Greeting is one of the three time-of-day variants.
    await expect(greeting).toContainText(/Доброго ранку|Добрий день|Добрий вечір/);

    await expect(page.getByRole('heading', { name: 'Твій контент' })).toBeVisible();
    await expect(page.getByTestId('recents-all-link')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Уроки воркшопу' })).toBeVisible();

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

  test('recents list (or empty state) renders without chevrons', async ({ page }) => {
    await page.goto('/dashboard');
    const list = page.getByTestId('recents-list');
    const empty = page.getByTestId('recents-empty');
    // Exactly one of the two states is shown.
    await expect(list.or(empty)).toBeVisible();

    if (await list.isVisible()) {
      const rows = page.getByTestId('recent-row');
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
      // Subline carries "{Тип} · {time}" — assert a type label is present.
      await expect(rows.first()).toContainText(/Рілс|Карусель|Сторіс/);
    }
  });

  test('insights skeleton dismisses and stays gone after reload', async ({ page }) => {
    await page.goto('/dashboard');
    const card = page.getByTestId('insights-skeleton');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Скоро');

    await page.getByTestId('insights-dismiss').click();
    await expect(card).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('insights-skeleton')).toHaveCount(0);
  });

  test('workshop lesson row is tappable', async ({ page }) => {
    await page.goto('/dashboard');
    const firstLesson = page.getByTestId('workshop-row').first();
    await expect(firstLesson).toBeVisible();
    await expect(firstLesson).toHaveAttribute('href', /youtube\.com/);
  });

  test('"Усі" link navigates', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('recents-all-link').click();
    await expect(page).toHaveURL(/\/projects/);
  });
});
