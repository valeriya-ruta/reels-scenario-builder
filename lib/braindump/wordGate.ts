/**
 * Braindump 50-word gate (task 86d3dcwyy). Import-free so the counting + gate
 * threshold can be unit-tested without the overlay. A braindump must reach the
 * target word count before it can be turned into content.
 */

export const BRAINDUMP_WORD_TARGET = 50;

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

/** True once the braindump has enough words to create content from. */
export function reachedWordGate(text: string, target: number = BRAINDUMP_WORD_TARGET): boolean {
  return countWords(text) >= target;
}
