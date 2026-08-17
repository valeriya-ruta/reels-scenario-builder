import { test, expect } from '@playwright/test';
import { AUTH_FAILURE_MESSAGE, isAuthTransportError } from '@/lib/authFailure';

/**
 * A save on Pro reported «Необхідно увійти в акаунт» to someone who was plainly
 * signed in, while Supabase's own auth log recorded no rejection at all — the
 * check never reached the auth server. The code could not tell the difference
 * because it discarded the error and returned null either way.
 *
 * These are the rules that decide which of the two happened.
 */
test.describe('auth failure: rejected vs unreachable', () => {
  test("Supabase's own retryable class is transport", () => {
    expect(isAuthTransportError({ name: 'AuthRetryableFetchError', message: 'x' })).toBe(true);
  });

  test('a dropped request reads as transport whatever wording it arrives in', () => {
    for (const message of [
      'fetch failed',
      'TypeError: fetch failed',
      'network error',
      'ETIMEDOUT',
      'socket hang up',
      'ECONNRESET',
    ]) {
      expect(isAuthTransportError({ message })).toBe(true);
    }
  });

  test('5xx is the service failing; 4xx is a verdict on the session', () => {
    expect(isAuthTransportError({ status: 503, message: 'unavailable' })).toBe(true);
    expect(isAuthTransportError({ status: 401, message: 'invalid claim' })).toBe(false);
    expect(isAuthTransportError({ status: 403, message: 'bad jwt' })).toBe(false);
  });

  test('an expired or already-used session is NOT transport — that one is real', () => {
    expect(isAuthTransportError({ message: 'Invalid Refresh Token: Already Used' })).toBe(false);
    expect(isAuthTransportError({ message: 'JWT expired' })).toBe(false);
  });

  test('no error at all is not a transport failure', () => {
    expect(isAuthTransportError(null)).toBe(false);
    expect(isAuthTransportError(undefined)).toBe(false);
  });

  test('the two failures say different things — the whole point', () => {
    expect(AUTH_FAILURE_MESSAGE.unauthenticated).not.toBe(AUTH_FAILURE_MESSAGE.unavailable);
    // Only one of them may send someone to the login page.
    expect(AUTH_FAILURE_MESSAGE.unavailable).not.toContain('увійти');
  });
});
