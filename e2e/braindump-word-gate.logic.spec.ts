import { test, expect } from '@playwright/test';
import { countWords, reachedWordGate, BRAINDUMP_WORD_TARGET } from '../lib/braindump/wordGate';

/**
 * Core-logic spec for the braindump 50-word gate (task 86d3dcwyy). The green
 * done/create arrow is disabled until the transcript reaches the target; this
 * pins the counting + threshold. (Live Deepgram streaming counter is the other
 * half of the task — pending the Deepgram API key, see NOTES.md.)
 */

test.describe('braindump word gate', () => {
  test('countWords handles empty / whitespace / multi-space', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('one')).toBe(1);
    expect(countWords('  one   two \n three ')).toBe(3);
  });

  test('gate is closed below the target and open at/above it', () => {
    const words49 = Array.from({ length: BRAINDUMP_WORD_TARGET - 1 }, (_, i) => `w${i}`).join(' ');
    const words50 = Array.from({ length: BRAINDUMP_WORD_TARGET }, (_, i) => `w${i}`).join(' ');
    const words60 = Array.from({ length: BRAINDUMP_WORD_TARGET + 10 }, (_, i) => `w${i}`).join(' ');

    expect(reachedWordGate(words49)).toBe(false);
    expect(reachedWordGate(words50)).toBe(true);
    expect(reachedWordGate(words60)).toBe(true);
    expect(reachedWordGate('')).toBe(false);
  });
});
