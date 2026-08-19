import { test, expect } from '@playwright/test';
import { insertAt, replaceRange } from '@/lib/reels/edit';
import type { Overlay } from '@/lib/reels/blocks';

/**
 * A dictated take lands twice.
 *
 * First the provisional text, assembled from four-second segments, so she is
 * not left watching a spinner over words she has already said. Then the same
 * take transcribed WHOLE — with all the context the slices never had, which is
 * where the accuracy was going — swapping itself into place.
 *
 * These are the rules that make the second landing safe: it replaces the exact
 * words it put there, or it replaces nothing at all.
 */

function mark(id: string, anchorText: string, anchorStart: number): Overlay {
  return { id, anchorText, anchorStart, kind: 'text', note: '' };
}

test('insertion reports the span its own words occupy, without the spacing', () => {
  const { text, span } = insertAt('Перше речення.', 'Перше речення.'.length, 'Друге речення.');
  // A space was added between them; the span must point past it, at the words.
  expect(text).toBe('Перше речення. Друге речення.');
  expect(text.slice(span.start, span.start + span.length)).toBe('Друге речення.');
});

test('the span is right when dictation lands at the very start of an empty note', () => {
  const { text, span } = insertAt('', 0, 'Я мріяла про життя.');
  expect(span.start).toBe(0);
  expect(text.slice(span.start, span.start + span.length)).toBe('Я мріяла про життя.');
});

test('the accurate take replaces exactly what the provisional one put in', () => {
  const base = 'Ось що я думаю. ';
  const first = insertAt(base, base.length, 'Найкращі ідеї це поле твоїх близьких.');

  const better = replaceRange(
    first.text,
    first.span.start,
    first.span.length,
    'Найкращі ідеї — це болі твоїх близьких.',
  );

  expect(better.text).toBe('Ось що я думаю. Найкращі ідеї — це болі твоїх близьких.');
  // Nothing around it moved.
  expect(better.text.startsWith(base)).toBe(true);
});

test('attachments after the swapped words follow them', () => {
  const text = 'Раз два три. Кінець.';
  const at = text.indexOf('Кінець');
  const overlays = [mark('o1', 'Кінець', at)];

  const out = replaceRange(text, 0, 'Раз два три.'.length, 'Раз, два, три, чотири.', overlays);
  expect(out.text).toBe('Раз, два, три, чотири. Кінець.');
  expect(out.text.slice(out.overlays[0].anchorStart)).toBe('Кінець.');
});

test('an attachment inside the swapped words collapses to the start, never drifts', () => {
  const text = 'Дванадцять тижнів замість року.';
  const overlays = [mark('o1', 'тижнів', text.indexOf('тижнів'))];

  const out = replaceRange(text, 0, text.length, 'Дванадцять тижнів = один рік.', overlays);
  // The phrase it was pinned to is gone. Anchoring at 0 is honest; anchoring at
  // whatever offset it used to hold would point at unrelated words.
  expect(out.overlays[0].anchorStart).toBe(0);
});

test('replacing never runs off the end of the text', () => {
  // A length longer than what is left is clamped rather than producing
  // undefined tail — the accurate take can be longer than the provisional one.
  expect(replaceRange('Корот', 5, 999, 'ше.').text).toBe('Коротше.');
  expect(replaceRange('Коротко.', 999, 5, '!').text).toBe('Коротко.!');
});

test('the swap is a pure function — the overlays it was given are untouched', () => {
  const overlays = [mark('o1', 'два', 4)];
  replaceRange('раз два три', 0, 3, 'один', overlays);
  expect(overlays[0].anchorStart).toBe(4);
});
