import 'server-only';
import crypto from 'node:crypto';
import { optionalServerEnv } from '@/lib/env';
import { codesMatch } from '@/lib/accessCodeCore';

/**
 * Server-side signup access-code gate (task 86d3e1egm).
 *
 * The valid code is read from the SIGNUP_ACCESS_CODE env var (editable in Vercel
 * without a redeploy of code — v1 per spec; a DB-backed value would be a trivial
 * follow-up). Validation is server-side. On success we set an HttpOnly, signed
 * grant cookie so the client can never forge access: the cookie value is an HMAC
 * keyed by the current code, so rotating the code invalidates every old grant.
 */

export const GATE_COOKIE = 'ruta_signup_gate';
/** Grant lifetime — long enough to finish signup, short enough to not linger. */
export const GATE_MAX_AGE_SECONDS = 60 * 60; // 1h

function expectedCode(): string | null {
  return optionalServerEnv('SIGNUP_ACCESS_CODE');
}

export function isAccessCodeValid(code: string): boolean {
  return codesMatch(code, expectedCode());
}

/** Deterministic HMAC of "granted", keyed by the current code (server secret). */
export function grantToken(): string {
  const key = `${expectedCode() ?? 'no-code-configured'}|ruta-signup-gate-v1`;
  return crypto.createHmac('sha256', key).update('granted').digest('hex');
}

export function isGrantValid(token: string | undefined | null): boolean {
  if (!token) return false;
  if (!expectedCode()) return false; // gate closed when no code configured
  const expected = grantToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
