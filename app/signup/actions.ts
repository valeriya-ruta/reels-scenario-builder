'use server';

import { cookies } from 'next/headers';
import {
  GATE_COOKIE,
  GATE_MAX_AGE_SECONDS,
  grantToken,
  isAccessCodeValid,
  isGrantValid,
} from '@/lib/accessCode';

/**
 * Validate the access code server-side. On success, set the HttpOnly signed
 * grant cookie so the signup page (and the submit re-check) will allow through.
 */
export async function submitAccessCode(code: string): Promise<{ ok: boolean }> {
  if (!isAccessCodeValid(code)) {
    return { ok: false };
  }
  const jar = await cookies();
  jar.set(GATE_COOKIE, grantToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: GATE_MAX_AGE_SECONDS,
  });
  return { ok: true };
}

/** Server-side re-check used as defense-in-depth right before account creation. */
export async function assertAccessGranted(): Promise<boolean> {
  const jar = await cookies();
  return isGrantValid(jar.get(GATE_COOKIE)?.value);
}
