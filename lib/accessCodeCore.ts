/**
 * Pure decision logic for the signup access-code gate (task 86d3e1egm).
 * Import-free so it can be unit-tested without server/env. The signed-cookie
 * grant + env wiring live in lib/accessCode.ts (server-only).
 */

export function normalizeCode(value: string): string {
  return value.trim();
}

/**
 * Does the user-entered code match the configured code?
 * Fail-safe: if no code is configured, the gate stays CLOSED (returns false) —
 * we never fall open. Empty input is always rejected.
 */
export function codesMatch(input: string, expected: string | null | undefined): boolean {
  const exp = (expected ?? '').trim();
  if (!exp) return false;
  const got = normalizeCode(input);
  if (got.length === 0) return false;
  return got === exp;
}
