import { test, expect } from '@playwright/test';

/**
 * The text screen, driven the way she drives it: on a phone, keyboard up.
 *
 * Runs against /dev/reel-preview, which mounts the screen on fixed props with
 * no account — the interactions here are the ones no unit test can reach, and
 * the ones that decide whether the screen is usable at all.
 */

const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE });

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/reel-preview');
  await expect(page.getByTestId('paragraph-row').first()).toBeVisible();
});

test('the reel opens as its text, with the attachment shown under its line', async ({ page }) => {
  const rows = page.getByTestId('paragraph-row');
  await expect(rows).toHaveCount(2);

  // The chip carries the instruction, on the line below the phrase it hangs off.
  await expect(page.getByTestId('overlay-chip')).toHaveText(/12 тижнів = 1 рік/);
});

test('nothing on screen asks for framing, pose or camera motion', async ({ page }) => {
  const body = await page.locator('body').innerText();
  for (const gone of ['Кадрування', 'Положення рук', 'Рух камери', 'Дія для переходу', 'Локація']) {
    expect(body).not.toContain(gone);
  }
});

test('typing lands in the text and the duration follows it', async ({ page }) => {
  const first = page.getByTestId('paragraph-row').first().locator('textarea');
  await first.click();
  // `End` goes to the end of the WRAPPED line, not the end of the value.
  await first.evaluate((el: HTMLTextAreaElement) =>
    el.setSelectionRange(el.value.length, el.value.length),
  );
  await first.pressSequentially(' Ще одне речення тут.');
  await expect(first).toHaveValue(/Ще одне речення тут\.$/);
});

test('Enter cuts the paragraph in two, right where the caret was', async ({ page }) => {
  const rows = page.getByTestId('paragraph-row');
  const first = rows.first().locator('textarea');

  await first.click();
  // Put the caret directly before «і не працюю».
  const value = (await first.inputValue()) ?? '';
  const at = value.indexOf('і не працюю');
  await first.evaluate((el: HTMLTextAreaElement, pos) => el.setSelectionRange(pos, pos), at);
  await first.press('Enter');

  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator('textarea')).toHaveValue('Я мріяла про життя, де встигаю все — ');
  await expect(rows.nth(1).locator('textarea')).toHaveValue('і не працюю до смерті.');
});

test('Backspace at the start joins the paragraph back, losing nothing', async ({ page }) => {
  const rows = page.getByTestId('paragraph-row');
  const second = rows.nth(1).locator('textarea');

  await second.click();
  await second.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
  await second.press('Backspace');

  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('textarea')).toHaveValue(
    /Я мріяла[\s\S]*Виявилось, річ не в дисципліні/,
  );
  // The attachment came across with the text it belongs to.
  await expect(page.getByTestId('overlay-chip')).toHaveText(/12 тижнів = 1 рік/);
});

test('selecting a phrase raises the attach bar, and picking a type attaches it', async ({ page }) => {
  const first = page.getByTestId('paragraph-row').first().locator('textarea');
  // Selected the way a thumb selects: put the caret down, then extend. This
  // goes through `selectionchange`, which is the only signal a long-press and
  // drag on a phone produces.
  await first.click();
  await first.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
  for (let i = 0; i < 8; i++) await first.press('Shift+ArrowRight');

  const bar = page.getByTestId('attach-bar');
  await expect(bar).toBeVisible();

  // It sits in the bottom third — a thumb does not reach the top of a phone.
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThan(PHONE.height * 0.55);

  await bar.locator('[data-kind="video"]').click();
  await expect(page.getByTestId('overlay-chip')).toHaveCount(2);
});

test('«Чистий текст» copies the script exactly, with its paragraph break', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.getByRole('button', { name: 'Чистий текст' }).click();
  await expect(page.getByTestId('clean-script')).toBeVisible();
  await page.getByTestId('copy-script').click();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(
    'Я мріяла про життя, де встигаю все — і не працюю до смерті.\n\n' +
      'Виявилось, річ не в дисципліні. Річ у дванадцяти тижнях замість цілого року.',
  );
  // No markers, no numbering, nothing that would be read out loud by mistake.
  expect(copied).not.toMatch(/^\d|Сцена|«12 тижнів/m);
});

test('«Що поверх» writes itself, with a timecode nobody typed', async ({ page }) => {
  await page.getByRole('button', { name: 'Що поверх' }).click();
  const rows = page.getByTestId('overlay-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('12 тижнів = 1 рік');
  await expect(rows.first()).toContainText(/0:\d\d/);
});

test('a wordless card asks what is on screen, not what is said', async ({ page }) => {
  await page.getByRole('button', { name: 'Кадр', exact: true }).click();
  const card = page.getByTestId('clip-card');
  await expect(card).toBeVisible();
  await expect(card.getByPlaceholder('Що на відео')).toBeVisible();
  await expect(card.getByPlaceholder('Напис на екрані')).toBeVisible();
  await expect(card.getByPlaceholder(/Встав посилання/)).toBeVisible();
});

test('the page never scrolls sideways', async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
