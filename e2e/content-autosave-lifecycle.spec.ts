import { test, expect, type Page } from '@playwright/test';
import { ACTIVE_STATE } from './utils/authPaths';

/**
 * Acceptance spec for the DEFERRED auto-save lifecycle (Status system 5/8 —
 * task 86d3btmnr): discard-empty + reel/story save-on-first-real-content +
 * reopen-restores. Encodes the locked scenarios from the task verbatim.
 *
 * ⚠️ PENDING IMPLEMENTATION. The status data model + Ідея-vs-Скрипт rule +
 * carousel promotion shipped; the sensitive create/leave wiring for
 * discard-empty and the reel/story editors was deliberately held until there is
 * a safe non-prod (staging) target to verify against — we do NOT wire those
 * flows blind against production. This suite is the ready-to-run harness for
 * that slice: it is `describe.skip` so it never fails CI, AND it self-skips
 * without E2E_ACTIVE_* creds. When the lifecycle lands on staging, remove the
 * `LIFECYCLE_READY` guard (or set E2E_LIFECYCLE_READY=1) to activate it.
 *
 * The locked rule (for the implementer):
 *   • Save trigger = ANY real content. Empty editor left untouched = discard.
 *   • Raw inputs only (name / dumped thought / reference+transcription) → Ідея.
 *   • Authored work (script text / real slide content) → Скрипт.
 *   • Reopening a saved piece restores ALL its content (esp. reel
 *     reference link + transcription).
 */

const LIFECYCLE_READY = process.env.E2E_LIFECYCLE_READY === '1';
const hasActive = !!process.env.E2E_ACTIVE_EMAIL && !!process.env.E2E_ACTIVE_PASSWORD;

/** A content row in /content or Home recents for a given title. */
function rowByTitle(page: Page, title: string) {
  return page.locator('[data-content-id]').filter({ hasText: title });
}

/** Assert a piece shows in the unified list with the given Ukrainian status + type. */
async function expectInList(page: Page, title: string, status: string, typeChip: string) {
  await page.goto('/content');
  const row = rowByTitle(page, title).first();
  await expect(row, `"${title}" should be in Твій контент`).toBeVisible();
  await expect(row).toContainText(status);
  await expect(row).toContainText(typeChip);
}

async function expectNotInList(page: Page, title: string) {
  await page.goto('/content');
  await expect(rowByTitle(page, title)).toHaveCount(0);
}

test.describe('Auto-save lifecycle — discard-empty + reel/story + reopen (86d3btmnr)', () => {
  test.skip(!LIFECYCLE_READY, 'Pending the discard-empty + reel/story create/leave wiring on a staging target (see PR).');
  test.skip(!hasActive, 'Requires E2E_ACTIVE_* credentials + a seeded authenticated user.');
  test.use({ storageState: ACTIVE_STATE });

  test('braindump: dump a thought → leave → in list as grey Ідея, content intact', async ({ page }) => {
    const thought = `QA braindump ${Date.now()}`;
    await page.goto('/');
    // Open the braindump overlay and dump text. (Selectors: confirm against UI.)
    await page.getByTestId('braindump-open').click();
    await page.getByTestId('braindump-input').fill(thought);
    await page.getByTestId('braindump-save').click();
    // Leave the overlay/app.
    await page.goto('/content');

    await expectInList(page, thought, 'Ідея', 'Ідея');
    // Reopen and confirm the dumped content is intact.
    await rowByTitle(page, thought).first().click();
    await expect(page.getByTestId('braindump-input')).toHaveValue(new RegExp(thought));
  });

  test('reel: reference + transcription, no script → Reel @ Ідея; reopen restores; script → Скрипт', async ({ page }) => {
    const ref = 'https://www.instagram.com/reel/QA_TEST/';
    await page.goto('/projects');
    await page.getByRole('button', { name: /Новий сценарій|Новий рілс/ }).click();
    // Add a reference link + run transcription, but write NO script.
    await page.getByTestId('reel-reference-url').fill(ref);
    await page.getByTestId('reel-transcribe').click();
    await expect(page.getByTestId('reel-transcript')).not.toBeEmpty();
    const url = page.url(); // remember this reel

    // Leave → should auto-save as Reel @ Ідея (kept its reel type), reference preserved.
    await page.goto('/content');
    const reelRow = page.locator('[data-content-id]').filter({ hasText: 'Рілс' }).first();
    await expect(reelRow).toContainText('Ідея');

    // Reopen → reference + transcription still there.
    await page.goto(url);
    await expect(page.getByTestId('reel-reference-url')).toHaveValue(ref);
    await expect(page.getByTestId('reel-transcript')).not.toBeEmpty();

    // Write actual script text → status flips to Скрипт.
    await page.getByTestId('reel-script').first().fill('Перший рядок сценарію');
    await page.goto('/content');
    await expect(page.locator('[data-content-id]').filter({ hasText: 'Рілс' }).first()).toContainText('Скрипт');
  });

  test('carousel: blank → leave → NOT in list; named → @ Ідея; real slide content → Скрипт', async ({ page }) => {
    // Open a blank carousel and immediately leave → must be discarded.
    await page.goto('/carousel');
    await page.getByRole('button', { name: /Нова карусель|Створити/ }).click();
    const blankUrl = page.url();
    await page.goto('/content');
    const blankId = new URL(blankUrl).pathname.split('/').pop()!;
    await expect(page.locator(`[data-content-id="${blankId}"]`)).toHaveCount(0);

    // New carousel, give it a name → in list @ Ідея.
    const name = `QA Carousel ${Date.now()}`;
    await page.goto('/carousel');
    await page.getByRole('button', { name: /Нова карусель|Створити/ }).click();
    await page.getByTestId('carousel-project-name').fill(name);
    await page.goto('/content');
    await expectInList(page, name, 'Ідея', 'Карусель');

    // Add real slide content → promotes to Скрипт.
    await rowByTitle(page, name).first().click();
    await page.getByTestId('carousel-title-input').first().fill('Справжній заголовок слайда');
    await page.goto('/content');
    await expect(rowByTitle(page, name).first()).toContainText('Скрипт');
  });

  test('story: blank → leave → NOT in list; named → @ Ідея', async ({ page }) => {
    await page.goto('/storytellings');
    await page.getByRole('button', { name: /Нова|Створити/ }).click();
    const blankUrl = page.url();
    const blankId = new URL(blankUrl).pathname.split('/').pop()!;
    await page.goto('/content');
    await expect(page.locator(`[data-content-id="${blankId}"]`)).toHaveCount(0);

    const name = `QA Story ${Date.now()}`;
    await page.goto('/storytellings');
    await page.getByRole('button', { name: /Нова|Створити/ }).click();
    await page.getByTestId('story-name').fill(name);
    await page.goto('/content');
    await expectInList(page, name, 'Ідея', 'Сторіс');
  });

  test('persistence: leave / background / reload cycles never lose a saved piece', async ({ page, context }) => {
    const name = `QA Persist ${Date.now()}`;
    await page.goto('/carousel');
    await page.getByRole('button', { name: /Нова карусель|Створити/ }).click();
    await page.getByTestId('carousel-project-name').fill(name);
    await page.getByTestId('carousel-title-input').first().fill('Контент який не має зникнути');

    // Background the tab (visibilitychange → hidden) — flush path.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    // Hard reload, then a fresh page (close/reopen) — content must survive both.
    await page.reload();
    const fresh = await context.newPage();
    await expectInList(fresh, name, 'Скрипт', 'Карусель');
    await fresh.close();
  });
});
