import { test, expect } from '@playwright/test';
import {
  DICTATION_PRIMER,
  dictationPrompt,
  isPrimerEcho,
  stripPrimerEcho,
} from '@/lib/ai/dictationPrompt';

/**
 * The primer is fed to the speech model as text preceding the audio, which is
 * what makes it bias the decoding — and also what makes the model hand it back
 * on a quiet passage. These are the rules that keep it out of her note without
 * taking her own words with it.
 */

test('Ukrainian gets the primer; other languages do not', () => {
  expect(dictationPrompt('uk')).toBe(DICTATION_PRIMER);
  expect(dictationPrompt('en')).toBeUndefined();
  expect(dictationPrompt(undefined)).toBeUndefined();
});

test('the primer is short enough to survive the 224-token window', () => {
  // Roughly: Cyrillic runs 2-3 tokens a word on these tokenizers, and the
  // vocabulary that fixes «рілс» and «сторіз» sits at the END of it — an
  // over-long primer would have exactly that truncated away.
  expect(DICTATION_PRIMER.split(/\s+/).length).toBeLessThan(70);
});

test('a sentence echoed back from the primer is dropped', () => {
  const echoed = 'Короче, я знімаю рілс, і сторіз теж, і в мене є контент-план, але, ну, він не працює.';
  expect(stripPrimerEcho(echoed)).toBe('');
});

test('her own words are never dropped, even when they sound like the primer', () => {
  const real = 'Я знімаю рілс про те, як ми з чоловіком робили додаток для алергій.';
  expect(stripPrimerEcho(real)).toBe(real);
});

test('short hesitations survive — she genuinely says them', () => {
  // «Ну от.» and «Як це сказати.» are IN the primer. Dropping every sentence
  // that appears there would delete her real speech, which is the opposite of
  // what a verbatim transcript is for.
  expect(isPrimerEcho('Ну от.')).toBe(false);
  expect(isPrimerEcho('Як це сказати.')).toBe(false);
  expect(stripPrimerEcho('Ну от. Я думаю, що це працює.')).toBe('Ну от. Я думаю, що це працює.');
});

test('an echo in the middle of a real take takes only itself', () => {
  const mixed = [
    'Я хочу розказати про те, звідки беруться ідеї.',
    'Ееее, ну коротше, я тут подумала… тобто, не подумала, а от прям відчула.',
    'Найкращі ідеї — це болі твоїх близьких.',
  ].join(' ');

  const kept = stripPrimerEcho(mixed);
  expect(kept).toContain('звідки беруться ідеї');
  expect(kept).toContain('болі твоїх близьких');
  expect(kept).not.toContain('прям відчула');
});

test('an empty or unrecognised transcript comes back unchanged', () => {
  expect(stripPrimerEcho('')).toBe('');
  expect(stripPrimerEcho('   ')).toBe('');
});
