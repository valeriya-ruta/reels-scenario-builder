import { test, expect } from '@playwright/test';
import {
  toTeleprompterBeats,
  estimateSpokenSeconds,
  formatDuration,
  beatsToPlainText,
} from '@/lib/content/teleprompter';

/**
 * Суфлер is what gets read ALOUD. The one thing it must never do is put
 * production machinery — scene labels, empty scenes, stray whitespace — into
 * the text the creator speaks.
 */

const scene = (order: number, lines: string | null, name: string | null = null) => ({
  order_index: order,
  lines,
  name,
});

test.describe('teleprompter beats', () => {
  test('keeps scene order regardless of array order', () => {
    const beats = toTeleprompterBeats([scene(2, 'друге'), scene(0, 'перше'), scene(1, 'середнє')]);
    expect(beats.map((b) => b.text)).toEqual(['перше', 'середнє', 'друге']);
    expect(beats.map((b) => b.index)).toEqual([1, 2, 3]);
  });

  test('drops empty and whitespace-only scenes, and renumbers', () => {
    const beats = toTeleprompterBeats([
      scene(0, 'перше'),
      scene(1, '   '),
      scene(2, null),
      scene(3, 'друге'),
    ]);
    expect(beats.map((b) => b.text)).toEqual(['перше', 'друге']);
    expect(beats.map((b) => b.index)).toEqual([1, 2]);
  });

  test('collapses internal whitespace so wrapping is the surface\'s decision', () => {
    const beats = toTeleprompterBeats([scene(0, '  дві\n\nстроки   тексту ')]);
    expect(beats[0].text).toBe('дві строки тексту');
  });

  test('marks structural beats as labels — never inside the spoken text', () => {
    const beats = toTeleprompterBeats([
      scene(0, 'зупиняючий рядок', 'ХУК'),
      scene(1, 'середина', 'Кухня'),
      scene(2, 'напиши в директ', 'CTA'),
    ]);
    expect(beats.map((b) => b.label)).toEqual(['ХУК', null, 'CTA']);
    // A scene NAME that merely describes the shot is not a beat label and must
    // not appear at all — reading "Кухня" aloud is the failure this prevents.
    expect(beatsToPlainText(beats)).toBe('зупиняючий рядок\n\nсередина\n\nнапиши в директ');
  });

  test('an empty script yields no beats rather than a blank one', () => {
    expect(toTeleprompterBeats([])).toEqual([]);
    expect(toTeleprompterBeats([scene(0, '')])).toEqual([]);
  });
});

test.describe('duration estimate', () => {
  test('scales with word count', () => {
    const short = toTeleprompterBeats([scene(0, 'одне два три')]);
    const long = toTeleprompterBeats([scene(0, Array(52).fill('слово').join(' '))]);
    expect(estimateSpokenSeconds(short)).toBeLessThan(estimateSpokenSeconds(long));
    expect(estimateSpokenSeconds(long)).toBe(20);
  });

  test('formats as m:ss with a padded seconds field', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(48)).toBe('0:48');
    expect(formatDuration(75)).toBe('1:15');
  });

  test('an empty script is zero, not NaN', () => {
    expect(estimateSpokenSeconds([])).toBe(0);
  });
});
