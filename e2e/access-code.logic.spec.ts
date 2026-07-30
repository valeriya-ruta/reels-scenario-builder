import { test, expect } from '@playwright/test';
import { codesMatch, normalizeCode } from '../lib/accessCodeCore';

/**
 * Core-logic spec for the signup access-code gate decision (task 86d3e1egm).
 * The server wiring (HMAC grant cookie, env) lives in lib/accessCode.ts; the
 * full gate → signup browser flow is the guarded harness (access-code-gate.spec.ts).
 * This pins the fail-safe decision rules.
 */

test.describe('signup access-code gate — decision logic', () => {
  test('empty / missing input is always rejected', () => {
    expect(codesMatch('', 'RUTA2026')).toBe(false);
    expect(codesMatch('   ', 'RUTA2026')).toBe(false);
  });

  test('fail-safe: with no configured code the gate stays closed', () => {
    expect(codesMatch('RUTA2026', null)).toBe(false);
    expect(codesMatch('RUTA2026', undefined)).toBe(false);
    expect(codesMatch('RUTA2026', '')).toBe(false);
    expect(codesMatch('RUTA2026', '   ')).toBe(false);
  });

  test('exact (case-sensitive) match passes; wrong code fails', () => {
    expect(codesMatch('RUTA2026', 'RUTA2026')).toBe(true);
    expect(codesMatch('ruta2026', 'RUTA2026')).toBe(false);
    expect(codesMatch('NOPE', 'RUTA2026')).toBe(false);
  });

  test('surrounding whitespace is trimmed on both sides', () => {
    expect(codesMatch('  RUTA2026  ', 'RUTA2026')).toBe(true);
    expect(codesMatch('RUTA2026', '  RUTA2026  ')).toBe(true);
    expect(normalizeCode('  x ')).toBe('x');
  });
});
