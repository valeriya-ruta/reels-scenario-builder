import { test, expect } from '@playwright/test';

/**
 * Browser harness for the signup access-code gate (task 86d3e1egm).
 *   • /signup shows the gate screen first (not the signup form)
 *   • wrong code → error, still gated
 *   • correct code → signup form appears
 *
 * Needs a server running with SIGNUP_ACCESS_CODE set; pass the same value as
 * E2E_SIGNUP_ACCESS_CODE to run it. Self-skips otherwise so it never blocks CI.
 * The decision logic is covered deterministically by access-code.logic.spec.ts.
 */

const CODE = process.env.E2E_SIGNUP_ACCESS_CODE;

test.describe('signup — access-code gate', () => {
  test.skip(!CODE, 'requires a running server with SIGNUP_ACCESS_CODE (pass as E2E_SIGNUP_ACCESS_CODE)');

  test('gate blocks until the correct code is entered', async ({ page }) => {
    await page.goto('/signup');

    // Gate is shown, signup form is not.
    await expect(page.getByRole('heading', { name: 'Введи код доступу' })).toBeVisible();
    await expect(page.getByTestId('access-code-input')).toBeVisible();
    await expect(page.getByPlaceholder('Електронна пошта')).toHaveCount(0);

    // Submit is disabled with no code.
    await expect(page.getByTestId('access-code-submit')).toBeDisabled();

    // Wrong code → error, still gated.
    await page.getByTestId('access-code-input').fill('definitely-wrong');
    await page.getByTestId('access-code-submit').click();
    await expect(page.getByTestId('access-code-error')).toBeVisible();
    await expect(page.getByPlaceholder('Електронна пошта')).toHaveCount(0);

    // Correct code → signup form appears.
    await page.getByTestId('access-code-input').fill(CODE!);
    await page.getByTestId('access-code-submit').click();
    await expect(page.getByPlaceholder('Електронна пошта')).toBeVisible();
  });
});
