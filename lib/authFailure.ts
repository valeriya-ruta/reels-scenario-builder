/**
 * Telling apart "the auth server said no" from "the auth server said nothing".
 *
 * Kept free of next/headers and the Supabase client so the rule can be tested
 * directly — it is the whole reason a save now says «спробуй ще раз» instead of
 * sending a signed-in person to the login page.
 */

export type AuthFailure = 'unauthenticated' | 'unavailable';

export type AuthErrorLike = { name?: string; message?: string; status?: number } | null | undefined;

/** A blip on the way to the auth server, as opposed to a rejected session. */
export function isAuthTransportError(error: AuthErrorLike): boolean {
  if (!error) return false;
  if (error.name === 'AuthRetryableFetchError') return true;
  // 5xx is the auth service failing, not a verdict on the session. 4xx IS a
  // verdict — 401/403 mean the session really is no good.
  if (typeof error.status === 'number' && error.status >= 500) return true;
  // `etimedout` spelled out: it is not "timeout" with a prefix.
  return /fetch failed|network|timeout|etimedout|econnreset|socket hang up/i.test(error.message ?? '');
}

/** What to show for each failure. Ukrainian, because the app is. */
export const AUTH_FAILURE_MESSAGE: Record<AuthFailure, string> = {
  unauthenticated: 'Необхідно увійти в акаунт.',
  unavailable: 'Сервер авторизації не відповів. Спробуй ще раз за секунду.',
};
