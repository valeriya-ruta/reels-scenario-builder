import { test, expect, type Page } from '@playwright/test';
import { ACTIVE_STATE } from './utils/authPaths';
import { watchConsoleErrors } from './utils/consoleErrors';

/**
 * Braindump overlay (task 86d38zghd). Voice transcription and idea auto-save are
 * mocked at the network boundary; MediaRecorder/getUserMedia are stubbed so the
 * voice path runs headless. Authenticated; skips without E2E creds.
 */
const hasActive = !!process.env.E2E_ACTIVE_EMAIL && !!process.env.E2E_ACTIVE_PASSWORD;

/** Stub the browser media APIs so the mic flow resolves deterministically. */
async function stubMedia(page: Page) {
  await page.addInitScript(() => {
    // @ts-expect-error test stub
    window.MediaRecorder = class {
      state = 'inactive';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      static isTypeSupported() {
        return true;
      }
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
        this.onstop?.();
      }
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
      },
    });
  });
}

async function openBraindump(page: Page) {
  await page.goto('/dashboard');
  await page.getByTestId('create-fab').click();
  await page.getByTestId('radial-option-ideas').click();
  await expect(page.getByTestId('braindump-overlay')).toBeVisible();
}

/** ≥ 50 words, to clear the create-content gate (task 86d3dcwyy). */
const FIFTY_WORDS = Array.from({ length: 52 }, (_, i) => `слово${i + 1}`).join(' ');

test.describe('Braindump overlay', () => {
  test.skip(!hasActive, 'Requires E2E_ACTIVE_* credentials and a seeded authenticated user.');
  test.use({ storageState: ACTIVE_STATE });

  test.beforeEach(async ({ page }) => {
    await stubMedia(page);
    await page.route('**/api/ideas/transcribe', (route) =>
      route.fulfill({ json: { ok: true, text: 'тестова ідея про контент' } })
    );
    await page.route('**/api/ideas/braindump', (route) =>
      route.fulfill({ json: { ok: true, id: 'idea-123' } })
    );
    // Live (Deepgram) word count is off in tests — the gate falls back to the
    // Whisper/typed word count. 503 = unconfigured, the graceful-degrade path.
    await page.route('**/api/ideas/deepgram-token', (route) =>
      route.fulfill({ status: 503, json: { error: 'deepgram_unconfigured' } })
    );
  });

  test('shows a rotating prompt from the seeded list', async ({ page }) => {
    await openBraindump(page);
    await expect(page.getByTestId('braindump-prompt')).toContainText(
      /Що в тебе на думці\?|Що тебе бісить\?|Розкажи про свій кейс|Яку помилку роблять інші\?/
    );
  });

  test('opens over a single full-screen blur scrim (no per-element blur)', async ({ page }) => {
    await openBraindump(page);
    const scrim = page.getByTestId('blur-scrim');
    await expect(scrim).toBeVisible();
    // One uniform backdrop-blur layer — not filters on individual UI elements.
    const filter = await scrim.evaluate(
      (el) => getComputedStyle(el).backdropFilter || (getComputedStyle(el) as unknown as { webkitBackdropFilter: string }).webkitBackdropFilter,
    );
    expect(filter).toContain('blur');
  });

  test('voice: recording transcribes via the API and text shows in gray (State A)', async ({
    page,
  }) => {
    const transcribeCall = page.waitForRequest('**/api/ideas/transcribe');
    await openBraindump(page);
    await page.getByTestId('braindump-mic').click(); // start
    await page.getByTestId('braindump-mic').click(); // stop → transcribe
    await transcribeCall;
    await expect(page.getByTestId('braindump-text')).toContainText('тестова ідея про контент');
    // Gray (muted) transcript while still in capture.
    await expect(page.getByTestId('braindump-text')).toHaveCSS('color', 'rgb(113, 113, 122)');
  });

  test('keyboard toggle switches to typing and the icon flips to mic; counter updates', async ({
    page,
  }) => {
    await openBraindump(page);
    await page.getByTestId('braindump-toggle-input').click();
    const textarea = page.getByTestId('braindump-text');
    await textarea.fill('одне два три');
    await expect(page.getByTestId('braindump-counter')).toContainText('3/50');
  });

  test('create-content gate: green arrow inactive below 50 words, active at ≥50', async ({ page }) => {
    await openBraindump(page);
    await page.getByTestId('braindump-toggle-input').click();
    const textarea = page.getByTestId('braindump-text');

    // Below the gate → disabled + counter shows progress, no navigation on tap.
    await textarea.fill('одне два три');
    await expect(page.getByTestId('braindump-counter')).toContainText('3/50');
    await expect(page.getByTestId('braindump-done')).toBeDisabled();
    await page.getByTestId('braindump-done').click({ force: true });
    await expect(page.getByTestId('braindump-overlay')).toHaveAttribute('data-phase', 'A');

    // At / above the gate → enabled.
    await textarea.fill(FIFTY_WORDS);
    await expect(page.getByTestId('braindump-counter')).toContainText('52/50');
    await expect(page.getByTestId('braindump-done')).toBeEnabled();
  });

  test('green arrow (≥50 words) → State B auto-saves the idea and shows the confirmation', async ({ page }) => {
    const saveCall = page.waitForRequest(
      (r) => r.url().includes('/api/ideas/braindump') && r.method() === 'POST'
    );
    await openBraindump(page);
    await page.getByTestId('braindump-toggle-input').click();
    await page.getByTestId('braindump-text').fill(FIFTY_WORDS);
    await page.getByTestId('braindump-done').click();

    await expect(page.getByTestId('braindump-overlay')).toHaveAttribute('data-phase', 'B');
    const req = await saveCall;
    expect(JSON.parse(req.postData() ?? '{}').content).toContain('слово1');
    await expect(page.getByTestId('braindump-saved')).toBeVisible();
  });

  test('State B shows three independent content-type buttons and × closes', async ({ page }) => {
    await openBraindump(page);
    await page.getByTestId('braindump-toggle-input').click();
    await page.getByTestId('braindump-text').fill(FIFTY_WORDS);
    await page.getByTestId('braindump-done').click();

    for (const type of ['reels', 'carousel', 'stories']) {
      await expect(page.getByTestId(`braindump-type-${type}`)).toBeVisible();
    }
    // Closing returns the user to where they were (no navigation away).
    await page.getByTestId('braindump-close').click();
    await expect(page.getByTestId('braindump-overlay')).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('editing in State B re-saves the edited version', async ({ page }) => {
    await openBraindump(page);
    await page.getByTestId('braindump-toggle-input').click();
    await page.getByTestId('braindump-text').fill(FIFTY_WORDS);
    await page.getByTestId('braindump-done').click();
    await expect(page.getByTestId('braindump-overlay')).toHaveAttribute('data-phase', 'B');

    const editSave = page.waitForRequest(
      (r) =>
        r.url().includes('/api/ideas/braindump') &&
        r.method() === 'POST' &&
        (r.postData() ?? '').includes('відредаговано')
    );
    await page.getByTestId('braindump-edit').fill(`${FIFTY_WORDS} відредаговано`);
    await editSave;
  });

  test('save failure shows a neutral error and preserves text', async ({ page }) => {
    await page.unroute('**/api/ideas/braindump');
    await page.route('**/api/ideas/braindump', (route) =>
      route.fulfill({ status: 500, json: { error: 'Не вдалося зберегти ідею.' } })
    );
    await openBraindump(page);
    await page.getByTestId('braindump-toggle-input').click();
    await page.getByTestId('braindump-text').fill(FIFTY_WORDS);
    await page.getByTestId('braindump-done').click();

    await expect(page.getByTestId('braindump-error')).toBeVisible();
    await expect(page.getByTestId('braindump-edit')).toHaveValue(/слово1/);
  });
});
