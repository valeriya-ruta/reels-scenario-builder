/** Spoken pace for estimates (matches tooltip copy: 130 words/min). */
const WORDS_PER_MINUTE = 130;

/**
 * Rough spoken duration from dialogue text (~130 words/min).
 * Returns 0 for empty text.
 */
export function estimateDialogueSeconds(text: string | null | undefined): number {
  const t = (text || '').trim();
  if (!t) return 0;
  const words = t.split(/\s+/).filter(Boolean).length;
  const wordsPerSecond = WORDS_PER_MINUTE / 60;
  return Math.max(1, Math.ceil(words / wordsPerSecond));
}

export type DurationTone = 'green' | 'yellow' | 'red';

/** Green ≤3s, yellow 4–6s, red >6s */
export function getDurationTone(seconds: number): DurationTone {
  if (seconds <= 3) return 'green';
  if (seconds <= 6) return 'yellow';
  return 'red';
}
