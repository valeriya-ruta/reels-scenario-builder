import { test, expect, type Page } from '@playwright/test';
import { ACTIVE_STATE } from './utils/authPaths';

/**
 * Browser harness for editing a piece BESIDE the calendar (План).
 *
 * The acceptance, in the order it is lived:
 *   • pick a day → tap a story/reel → it opens in the panel, read-only
 *   • the pencil turns THAT panel editable — the URL never changes, so the
 *     month is still behind it and there is no column to hunt for
 *   • change a line → Зберегти → the panel is reading again, with the new line
 *   • a carousel has no in-panel pencil: its editor opens in a NEW TAB
 *   • «＋ Створити» on a day makes the piece on that day and opens it editable
 *     right here, instead of throwing you into an empty builder
 *
 * Self-skips without E2E_ACTIVE_* creds (the convention every authenticated
 * spec here follows), so it never blocks CI but is ready to run against a
 * seeded account. The diff that Save actually sends is covered deterministically
 * by plan-inline-edit.logic.spec.ts.
 */

const hasActive = !!process.env.E2E_ACTIVE_EMAIL && !!process.env.E2E_ACTIVE_PASSWORD;

/** Open the first day of the month that has anything scheduled on it. */
async function openFirstBusyDay(page: Page): Promise<boolean> {
  await page.goto('/plan');
  const busy = page.locator('[data-testid="cal-day"]:not([data-count="0"])');
  if ((await busy.count()) === 0) return false;
  await busy.first().click();
  await expect(page.getByTestId('cal-day-card').first()).toBeVisible();
  return true;
}

/** The panel, wherever this viewport puts it (sheet on a phone, column on a desktop). */
function panel(page: Page) {
  return page.locator('[data-testid="plan-detail-sheet"], [data-testid="plan-detail-panel"]').first();
}

test.describe('план — editing beside the calendar', () => {
  test.skip(!hasActive, 'requires E2E_ACTIVE_* credentials + a seeded, scheduled piece');
  test.use({ storageState: ACTIVE_STATE });

  test('a story is fixed in the panel and saved back to reading', async ({ page }) => {
    test.skip(!(await openFirstBusyDay(page)), 'no scheduled content in the current month');

    await page.getByTestId('cal-day-card').first().click();
    const open = panel(page);
    await expect(open.getByTestId('shared-detail')).toBeVisible();

    const editButton = open.getByTestId('piece-edit-inline');
    test.skip((await editButton.count()) === 0, 'first piece of the day is a carousel');

    const urlBefore = page.url();
    await editButton.click();
    await expect(open.getByTestId('piece-inline-editor')).toBeVisible();
    // The whole point: editing happens HERE, not at the end of a navigation.
    expect(page.url()).toBe(urlBefore);

    // Type into whichever body this format has.
    const body = open.locator('[data-testid="inline-story-text"], [data-testid="inline-block-spoken"]').first();
    await expect(body).toBeVisible();
    const written = `правка ${Date.now()}`;
    await body.fill(written);

    await open.getByTestId('inline-save').click();

    // Back to reading, carrying the change.
    await expect(open.getByTestId('shared-detail')).toBeVisible({ timeout: 15_000 });
    await expect(open.getByTestId('piece-inline-editor')).toHaveCount(0);
    await expect(open).toContainText(written);

    // And it is really in the database, not just on screen.
    await page.reload();
    await openFirstBusyDay(page);
    await page.getByTestId('cal-day-card').first().click();
    await expect(panel(page)).toContainText(written, { timeout: 15_000 });
  });

  test('Скасувати puts the piece back as it was', async ({ page }) => {
    test.skip(!(await openFirstBusyDay(page)), 'no scheduled content in the current month');

    await page.getByTestId('cal-day-card').first().click();
    const open = panel(page);
    const editButton = open.getByTestId('piece-edit-inline');
    test.skip((await editButton.count()) === 0, 'first piece of the day is a carousel');

    const before = (await open.getByTestId('shared-detail').textContent()) ?? '';
    await editButton.click();

    const body = open.locator('[data-testid="inline-story-text"], [data-testid="inline-block-spoken"]').first();
    await body.fill('це не має зберегтися');

    // Discarding asks first — the panel has no autosave to fall back on.
    page.once('dialog', (dialog) => dialog.accept());
    await open.getByTestId('inline-cancel').click();

    await expect(open.getByTestId('shared-detail')).toBeVisible();
    expect(await open.getByTestId('shared-detail').textContent()).toBe(before);
  });

  test('a carousel opens its own editor in a new tab, not in the panel', async ({ page, context }) => {
    await page.goto('/plan');
    const busy = page.locator('[data-testid="cal-day"]:not([data-count="0"])');
    const days = await busy.count();

    for (let i = 0; i < days; i += 1) {
      await busy.nth(i).click();
      const cards = page.getByTestId('cal-day-card');
      for (let c = 0; c < (await cards.count()); c += 1) {
        await cards.nth(c).click();
        const open = panel(page);
        await expect(open.getByTestId('shared-detail')).toBeVisible();

        // A carousel is the one format with no in-panel pencil.
        if ((await open.getByTestId('piece-edit-inline').count()) > 0) continue;

        const [tab] = await Promise.all([
          context.waitForEvent('page'),
          open.getByTestId('piece-open-editor').click(),
        ]);
        await expect(tab).toHaveURL(/\/carousel\//);
        // The month is still open behind it.
        await expect(page).toHaveURL(/\/plan/);
        await tab.close();
        return;
      }
    }
    test.skip(true, 'no carousel scheduled in the current month');
  });

  test('creating on a day opens the new piece editable, right here', async ({ page }) => {
    await page.goto('/plan');
    await page.locator('[data-testid="cal-day"]').nth(10).click();

    await page.getByTestId('plan-create').click();
    await page.getByTestId('plan-create-stories').click();

    const open = panel(page);
    await expect(open.getByTestId('piece-inline-editor')).toBeVisible({ timeout: 15_000 });
    // Created ON the day, without leaving the month.
    await expect(page).toHaveURL(/\/plan/);
    await expect(page.getByTestId('cal-day-card')).not.toHaveCount(0);
  });
});
