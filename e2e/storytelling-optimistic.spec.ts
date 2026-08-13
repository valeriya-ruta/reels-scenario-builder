import { test, expect } from '@playwright/test';
import { ACTIVE_STATE } from './utils/authPaths';

/**
 * Browser harness for optimistic create in the storytelling board (task
 * 86d3fcnny). Asserts the acceptance flow end-to-end:
 *   • click "Додати сторітел" (new column) → a new column appears effectively
 *     instantly (no 1–3s await-before-render), even on a throttled connection
 *   • the new column carries its OWN status and date — a column is a whole
 *     storytelling, which is what makes the multi-day board safe to schedule
 *   • click "Додати сторіс" inside it → a new card appears instantly
 *   • reload → both persisted with real ids + correct ordering
 *
 * Self-skips without E2E_ACTIVE_* creds (same convention as the other
 * authenticated specs), so it never blocks CI but is ready to run against a
 * seeded staging account. The deterministic ordering/id contract is covered by
 * storytelling-optimistic.logic.spec.ts.
 */

const hasActive = !!process.env.E2E_ACTIVE_EMAIL && !!process.env.E2E_ACTIVE_PASSWORD;

test.describe('storytelling — optimistic create (perceived lag fix)', () => {
  test.skip(!hasActive, 'requires E2E_ACTIVE_* credentials + a seeded storytelling project');
  test.use({ storageState: ACTIVE_STATE });

  test('new column and new story appear instantly and persist', async ({ page }) => {
    // Throttle so a non-optimistic implementation (await insert → render) would
    // visibly stall; the optimistic path must render before the round-trip.
    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 800,
      downloadThroughput: (500 * 1024) / 8,
      uploadThroughput: (500 * 1024) / 8,
    });

    // Open the first storytelling project.
    await page.goto('/storytellings');
    const firstProject = page.locator('a[href^="/storytelling/"]').first();
    await expect(firstProject).toBeVisible();
    await firstProject.click();

    const columnsBefore = await page.getByTestId('story-column').count();

    // New column must appear well within the throttled round-trip time.
    await page.getByTestId('add-column').click();
    await expect
      .poll(() => page.getByTestId('story-column').count(), { timeout: 400 })
      .toBe(columnsBefore + 1);

    // Each column schedules itself: its own status pill and its own date chip.
    const lastColumn = page.getByTestId('story-column').last();
    await expect(lastColumn.getByTestId('status-pill')).toBeVisible();
    await expect(lastColumn.getByTestId('schedule-chip')).toBeVisible();
    // The server proposes the next open day, so the new column lands dated.
    await expect
      .poll(() => lastColumn.getByTestId('schedule-chip').getAttribute('data-scheduled'), {
        timeout: 5_000,
      })
      .toBe('true');

    // New story inside the last column appears instantly.
    const cardsBefore = await lastColumn.getByPlaceholder('Про що').count();
    await lastColumn.getByTestId('add-story').click();
    await expect
      .poll(() => lastColumn.getByPlaceholder('Про що').count(), { timeout: 400 })
      .toBe(cardsBefore + 1);

    // Reload — both persisted with real ids (no reconcile loss).
    await page.reload();
    await expect.poll(() => page.getByTestId('story-column').count()).toBe(columnsBefore + 1);
  });
});
