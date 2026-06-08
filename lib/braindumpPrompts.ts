/**
 * Rotating braindump prompts. One is picked at random each time the overlay
 * opens. Kept as a single string array here so the copy can be swapped later
 * (Kunj will supply the final list — this is the seed list from the spec).
 */
export const BRAINDUMP_PROMPTS: string[] = [
  'Що в тебе на думці?',
  'Що тебе бісить?',
  'Розкажи про свій кейс',
  'Яку помилку роблять інші?',
];

/** Returns a random prompt (optionally avoiding `previous` to vary between opens). */
export function pickBraindumpPrompt(previous?: string | null): string {
  const pool =
    previous && BRAINDUMP_PROMPTS.length > 1
      ? BRAINDUMP_PROMPTS.filter((p) => p !== previous)
      : BRAINDUMP_PROMPTS;
  return pool[Math.floor(Math.random() * pool.length)];
}
