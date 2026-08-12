import { test, expect, type Page } from '@playwright/test';
import { ACTIVE_STATE } from './utils/authPaths';
import { watchConsoleErrors } from './utils/consoleErrors';

/**
 * Repurpose overlay — the flow, in a browser. Scraping and transcription are
 * server actions behind Apify/Groq, so this covers what the CLIENT owns: opening
 * from the create menu without navigating, understanding a pasted link before
 * anything expensive runs, and gating the expensive step on a link we recognise.
 *
 * The pure rules underneath (detection, target matrix, brief, thread clamp) are
 * covered exhaustively in repurpose.logic.spec.ts, which needs no browser.
 * Authenticated; skips without E2E creds.
 */
const hasActive = !!process.env.E2E_ACTIVE_EMAIL && !!process.env.E2E_ACTIVE_PASSWORD;

const REEL_URL = 'https://www.instagram.com/reel/Cxyz123/';

async function openRepurpose(page: Page) {
  await page.goto('/dashboard');
  await page.getByTestId('create-fab').click();
  await page.getByTestId('radial-option-repurpose').click();
  await expect(page.getByTestId('repurpose-overlay')).toBeVisible();
}

test.describe('Repurpose overlay', () => {
  test.skip(!hasActive, 'Requires E2E_ACTIVE_* credentials and a seeded authenticated user.');
  test.use({ storageState: ACTIVE_STATE });

  test('Переробити opens the overlay without navigating', async ({ page }) => {
    const watcher = watchConsoleErrors(page);
    await openRepurpose(page);
    await expect(page.getByTestId('repurpose-overlay')).toHaveAttribute('data-phase', 'link');
    await expect(page).toHaveURL(/\/dashboard/);
    expect(watcher.errors, watcher.errors.join('\n')).toEqual([]);
  });

  test('a pasted link is labelled before anything is scraped', async ({ page }) => {
    await openRepurpose(page);
    const chip = page.getByTestId('repurpose-detected');
    await expect(chip).toHaveCount(0);

    await page.getByTestId('repurpose-url').fill(REEL_URL);
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-kind', 'reel');

    await page.getByTestId('repurpose-url').fill('https://www.threads.com/@ruta/post/DFa1b2C');
    await expect(chip).toHaveAttribute('data-kind', 'threads');
  });

  test('the expensive step stays disabled until the link is understood', async ({ page }) => {
    await openRepurpose(page);
    const extract = page.getByTestId('repurpose-extract');
    await expect(extract).toBeDisabled();

    await page.getByTestId('repurpose-url').fill('https://youtube.com/watch?v=abc');
    await expect(extract).toBeDisabled();
    await expect(page.getByTestId('repurpose-detected')).toHaveCount(0);

    await page.getByTestId('repurpose-url').fill(REEL_URL);
    await expect(extract).toBeEnabled();
  });

  test('closing returns to the page underneath', async ({ page }) => {
    await openRepurpose(page);
    await page.getByTestId('repurpose-close').click();
    await expect(page.getByTestId('repurpose-overlay')).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
