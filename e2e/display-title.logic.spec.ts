import { test, expect } from '@playwright/test';
import {
  displayTitle,
  isPlaceholderTitle,
  previewAddsInfo,
  NEW_LABELS,
} from '@/lib/content/displayTitle';

/**
 * §1 — the title rule, in one line:
 *   displayTitle = savedTitle || "Нов{а/ий} {type}". No third state.
 *
 * «Без назви» was not merely a display fallback — it was being INSERTED into the
 * database as a real name, so a brand-new carousel was genuinely called that.
 * Both halves are covered here: the string never survives a read, and the
 * duplicate-title case (carousel names are derived FROM the cover title) is
 * detected rather than rendered twice.
 */

test.describe('the banned string', () => {
  test('«Без назви» is recognised as untitled, however it is cased or spaced', () => {
    expect(isPlaceholderTitle('Без назви')).toBe(true);
    expect(isPlaceholderTitle('  без   НАЗВИ ')).toBe(true);
    expect(isPlaceholderTitle('no name')).toBe(true);
    expect(isPlaceholderTitle('Untitled')).toBe(true);
    expect(isPlaceholderTitle('')).toBe(true);
    expect(isPlaceholderTitle(null)).toBe(true);
  });

  test('a real title is never mistaken for a placeholder', () => {
    expect(isPlaceholderTitle('Як ми втратили 700 клієнтів')).toBe(false);
  });

  test('it never reaches the screen — the fallback is type-appropriate', () => {
    expect(displayTitle('Без назви', 'reel')).toBe(NEW_LABELS.reel);
    expect(displayTitle('', 'carousel')).toBe(NEW_LABELS.carousel);
    expect(displayTitle(null, 'story')).toBe(NEW_LABELS.story);
    expect(displayTitle('no name', 'reel')).toBe('Новий рілс');
  });

  test('no label is itself a placeholder — the fallback is stable under re-read', () => {
    for (const [kind, label] of Object.entries(NEW_LABELS)) {
      expect(isPlaceholderTitle(label)).toBe(false);
      expect(displayTitle(label, kind as keyof typeof NEW_LABELS)).toBe(label);
    }
  });

  test('a real saved title is shown verbatim, only whitespace-normalised', () => {
    expect(displayTitle('  Як ми   втратили 700  ', 'carousel')).toBe('Як ми втратили 700');
  });
});

test.describe('one title per card', () => {
  test('a preview identical to the title adds nothing', () => {
    // This is the carousel case exactly: deriveCarouselNameFromRant names the
    // project after slide 1's title, so the two strings match.
    expect(previewAddsInfo('Як ми втратили 700 клієнтів', 'Як ми втратили 700 клієнтів')).toBe(false);
  });

  test('a CLIPPED name still counts as the same title', () => {
    // Names are clipped, so the saved name is often a prefix of the cover line.
    expect(previewAddsInfo('Як ми втратили 700 клі', 'Як ми втратили 700 клієнтів')).toBe(false);
    expect(previewAddsInfo('Як ми втратили 700 клієнтів', 'Як ми втратили')).toBe(false);
  });

  test('punctuation and case differences do not make it a new line', () => {
    expect(previewAddsInfo('«Як ми втратили 700 клієнтів»', 'Як ми втратили 700 клієнтів!')).toBe(
      false,
    );
  });

  test('a genuinely different preview line is kept', () => {
    expect(previewAddsInfo('Втрачені клієнти', 'Історія однієї дорогої помилки')).toBe(true);
  });

  test('an empty preview is never rendered; an untitled piece keeps its preview', () => {
    expect(previewAddsInfo('Щось', '')).toBe(false);
    expect(previewAddsInfo('', 'Реальний хук')).toBe(true);
  });
});
