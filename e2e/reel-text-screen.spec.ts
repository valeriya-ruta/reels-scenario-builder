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
  // The dev overlay portal sits over the bottom-left corner and swallows taps
  // meant for the toolbar. It does not exist in a production build.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await expect(page.getByTestId('note-editor')).toBeVisible();
});

test('the reel opens as its text, with the attachment shown under its line', async ({ page }) => {
  
  // The chip carries the instruction, on the line below the phrase it hangs off.
  await expect(page.getByTestId('overlay-chip')).toHaveText(/12 тижнів = 1 рік/);
});

test('nothing on screen asks for framing, pose or camera motion', async ({ page }) => {
  const body = await page.locator('body').innerText();
  for (const gone of ['Кадрування', 'Положення рук', 'Рух камери', 'Дія для переходу', 'Локація']) {
    expect(body).not.toContain(gone);
  }
});

test('it reads as a note: no scene numbers, no per-row controls, one toolbar', async ({ page }) => {
  await expect(page.getByLabel('Вище')).toHaveCount(0);
  await expect(page.getByLabel('Нижче')).toHaveCount(0);

  const bar = page.getByTestId('reel-toolbar');
  await expect(bar).toBeVisible();
  // Three controls at rest — mic, «Зробити рілс», ⋯ — not a row of tabs.
  await expect(bar.locator('button')).toHaveCount(3);
  await expect(page.getByTestId('mic')).toBeVisible();
});

test('typing lands in the text', async ({ page }) => {
  const area = page.locator('[data-testid="note-editor"] textarea');
  await area.click();
  await area.evaluate((el: HTMLTextAreaElement) =>
    el.setSelectionRange(el.value.length, el.value.length),
  );
  await area.pressSequentially(' Ще одне речення тут.');
  await expect(area).toHaveValue(/Ще одне речення тут\.$/);
});

test('Enter is just a newline — no clever paragraph machinery', async ({ page }) => {
  const area = page.locator('[data-testid="note-editor"] textarea');
  await area.click();
  await area.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
  await area.press('Enter');
  await expect(area).toHaveValue(/^\n/);
  await expect(page.locator('[data-testid="note-editor"] textarea')).toHaveCount(1);
});

test('selecting a phrase raises the attach bar, and picking a type attaches it', async ({ page }) => {
  const area = page.locator('[data-testid="note-editor"] textarea');
  // Selected the way a thumb selects: put the caret down, then extend. This
  // goes through `selectionchange`, which is the only signal a long-press and
  // drag on a phone produces.
  await area.click();
  await area.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
  for (let i = 0; i < 8; i++) await area.press('Shift+ArrowRight');

  // The one toolbar changes rather than a second bar appearing.
  const bar = page.getByTestId('reel-toolbar');
  await expect(bar.locator('[data-kind="video"]')).toBeVisible();

  // It sits in the bottom third — a thumb does not reach the top of a phone.
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThan(PHONE.height * 0.55);

  // Every attach button says its word: the glyph alone was unreadable.
  await expect(bar.locator('[data-kind="video"]')).toContainText('Відео');
  await expect(bar.locator('[data-kind="sound"]')).toContainText('Звук');

  await bar.locator('[data-kind="video"]').click();
  await expect(page.getByTestId('overlay-chip')).toHaveCount(2);
});

test('copying the script is on the page, not buried behind ⋯', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByTestId('copy-inline').click();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Я мріяла про життя');
  expect(copied).toContain('Виявилось, річ не в дисципліні');
});

test('deleting a paragraph by accident can be taken back', async ({ page }) => {
  const area = page.locator('[data-testid="note-editor"] textarea');
  const before = await area.inputValue();

  // The accident: the selection handles took more than she meant, and it went.
  await area.click();
  await area.evaluate((el: HTMLTextAreaElement) => {
    el.setSelectionRange(0, el.value.length);
  });
  await area.press('Backspace');
  await expect(area).toHaveValue('');

  await page.getByTestId('undo-edit').click();
  await expect(area).toHaveValue(before);
});

test('the note has no focus ring — it is a page, not a form field', async ({ page }) => {
  const area = page.locator('[data-testid="note-editor"] textarea');
  await area.click();
  const outline = await area.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe('none');
});

test('«Чистий текст» copies the script exactly, with its paragraph break', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.getByTestId('more').click();
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
  await page.getByTestId('more').click();
  await page.getByRole('button', { name: 'Що поверх' }).click();
  const rows = page.getByTestId('overlay-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('12 тижнів = 1 рік');
  await expect(rows.first()).toContainText(/0:\d\d/);
});

test('a wordless card asks what is on screen, not what is said', async ({ page }) => {
  await page.getByTestId('more').click();
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
