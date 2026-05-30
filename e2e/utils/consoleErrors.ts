import type { Page } from '@playwright/test';

/**
 * Known-benign console noise that must not fail a test. These are environment /
 * analytics artifacts unrelated to the feature under test (missing analytics
 * keys in local/test runs, favicon fetches, browser dev warnings).
 */
const BENIGN = [
  /posthog/i,
  /favicon/i,
  /Failed to load resource: the server responded with a status of 4\d\d/i,
  /Download the React DevTools/i,
  /supabase env vars are not set/i,
];

export type ConsoleWatcher = { errors: string[] };

/**
 * Attach listeners that collect uncaught page exceptions and console.error
 * output, skipping known-benign noise. Returns a live array of error strings.
 */
export function watchConsoleErrors(page: Page): ConsoleWatcher {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (BENIGN.some((re) => re.test(text))) return;
    errors.push(`console.error: ${text}`);
  });

  page.on('pageerror', (err) => {
    const text = err.message ?? String(err);
    if (BENIGN.some((re) => re.test(text))) return;
    errors.push(`pageerror: ${text}`);
  });

  return { errors };
}
