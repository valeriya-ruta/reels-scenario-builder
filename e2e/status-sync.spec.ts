import { test, expect, type Page } from '@playwright/test';
import { ACTIVE_STATE } from './utils/authPaths';

/**
 * Prompt 9's acceptance, against a real object: change a piece's status ONCE
 * and it reads the same everywhere.
 *
 * The old failure was not subtle — Home mounts the content rows more than once
 * over overlapping data, so a piece could sit in Сьогодні as «Опубліковано»
 * while the section below it still said «Скрипт». That is what this proves is
 * gone: same id, same `data-status`, in every section, without a reload.
 *
 * Authenticated + seeded; skips cleanly without E2E_ACTIVE_* credentials, in
 * line with every other authed spec in this suite.
 */
const hasActive = !!process.env.E2E_ACTIVE_EMAIL && !!process.env.E2E_ACTIVE_PASSWORD;

/** Every rendering of a piece on the current screen, by id. */
function cards(page: Page, id: string) {
  return page.locator(`[data-content-id="${id}"]`);
}

/** The distinct statuses the screen is currently showing for that piece. */
async function statusesOf(page: Page, id: string): Promise<string[]> {
  const values = await cards(page, id).evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLElement).dataset.status ?? ''),
  );
  return [...new Set(values)];
}

test.describe('one object = one status', () => {
  test.skip(!hasActive, 'Requires E2E_ACTIVE_* credentials and a seeded authenticated user.');
  test.use({ storageState: ACTIVE_STATE });

  test('a status change on Home updates every section at once', async ({ page }) => {
    await page.goto('/dashboard');

    // Pick a piece that Home renders in more than one section — that overlap is
    // precisely where the divergence used to appear.
    const ids = await page
      .locator('[data-content-id]')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset.contentId ?? ''));
    const repeated = ids.find((id, i) => id && ids.indexOf(id) !== i);
    test.skip(!repeated, 'Needs a piece that appears in two Home sections (e.g. scheduled today).');
    const id = repeated as string;

    // Pre-condition: consistent to begin with.
    expect(await statusesOf(page, id)).toHaveLength(1);
    const before = (await statusesOf(page, id))[0];

    // ONE change, from ONE of the sections.
    await cards(page, id).first().getByRole('button', { name: 'Змінити статус' }).click();

    // Every rendering moved together, with no reload.
    await expect
      .poll(async () => (await statusesOf(page, id))[0], { timeout: 5000 })
      .not.toBe(before);
    expect(await statusesOf(page, id)).toHaveLength(1);
    const after = (await statusesOf(page, id))[0];

    // …and it survives a round trip, i.e. it was actually persisted and the
    // cached RSC payload was invalidated rather than re-serving the old value.
    await page.reload();
    expect(await statusesOf(page, id)).toEqual([after]);

    // Same object, same status, on the other surfaces that display it.
    for (const route of ['/content', '/plan', '/staging']) {
      await page.goto(route);
      const seen = await statusesOf(page, id);
      // The piece may legitimately not appear (Розбір excludes dated/published
      // work) — but where it appears, it must agree.
      if (seen.length > 0) expect(seen).toEqual([after]);
    }
  });
});
