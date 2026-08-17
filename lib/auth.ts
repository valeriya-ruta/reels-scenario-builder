import type { User } from '@supabase/supabase-js';
import { createServerSupabaseClient } from './supabaseServer';
import { isAuthTransportError, type AuthFailure } from './authFailure';

export { AUTH_FAILURE_MESSAGE, type AuthFailure } from './authFailure';

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { user, error };
}

/**
 * `unauthenticated` means the auth server answered and said no. `unavailable`
 * means it never answered — a fetch that failed, a timeout, a 5xx. Those are
 * opposite facts about the user and must not produce the same sentence: telling
 * someone who is plainly signed in to «увійти в акаунт» sends them to re-login,
 * which fixes nothing and loses whatever they were doing.
 */
export type AuthResult = { user: User } | { user: null; reason: AuthFailure };

/**
 * The user, or the reason there isn't one.
 *
 * A transport failure is retried once before being believed: these are single
 * dropped requests, and one retry is the difference between a save going
 * through and a person being told to sign in mid-work.
 */
export async function requireAuthResult(): Promise<AuthResult> {
  const first = await getCurrentUser();
  if (first.user) return { user: first.user };

  if (isAuthTransportError(first.error)) {
    const second = await getCurrentUser();
    if (second.user) return { user: second.user };
    if (isAuthTransportError(second.error)) {
      console.error('[auth] auth server unreachable:', second.error?.message ?? first.error?.message);
      return { user: null, reason: 'unavailable' };
    }
    // The retry got a real answer, so trust that one.
    return { user: null, reason: 'unauthenticated' };
  }

  // Logged, because a signed-out answer where the app expected a session is
  // worth seeing: the old code discarded this and left nothing to look at.
  if (first.error) console.error('[auth] rejected:', first.error.message);
  return { user: null, reason: 'unauthenticated' };
}

export async function requireAuth() {
  const result = await requireAuthResult();
  return result.user;
}
