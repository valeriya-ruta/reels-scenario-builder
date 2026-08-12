import { test, expect } from '@playwright/test';
import { detectRepurposeSource } from '../lib/repurpose/sourceUrl';
import { composeRepurposeBrief, repurposeSourceTitle } from '../lib/repurpose/compose';
import {
  TARGETS_BY_SOURCE,
  isTargetAllowed,
  isContentTypeTarget,
  REPURPOSE_TARGETS,
  type RepurposeSourceKind,
} from '../lib/repurpose/types';
import {
  normalizeThreadPosts,
  deriveThreadTitle,
  THREADS_POST_CHAR_LIMIT,
  THREAD_MAX_POSTS,
} from '../lib/ai/threadNormalize';

/**
 * Repurposing's non-negotiables, all of which are pure and therefore testable
 * without a browser, a key, or a network:
 *
 *  1. A pasted link is understood BEFORE anything expensive runs — the overlay
 *     labels it live, so detection has to cope with what people actually paste.
 *  2. A source is never offered its own format back (that's a rewrite, not a
 *     repurpose).
 *  3. The brief handed to a generator always carries the source's own words,
 *     its link, and the target format.
 *  4. A generated thread is always postable: within Threads' 500-character
 *     limit, without "1/7" counters, never empty.
 */

test.describe('repurpose — link detection', () => {
  test('Instagram reels and posts are read as a reel source', () => {
    for (const url of [
      'https://www.instagram.com/reel/Cxyz123/',
      'https://instagram.com/reels/Cxyz123',
      'instagram.com/reel/Cxyz123/?igsh=abc123',
      'https://www.instagram.com/p/Cxyz123/',
      'https://www.instagram.com/ruta/reel/Cxyz123/',
    ]) {
      const result = detectRepurposeSource(url);
      expect(result.ok, url).toBe(true);
      if (!result.ok) continue;
      expect(result.kind).toBe('reel');
      expect(result.canonicalUrl).toBe('https://www.instagram.com/reel/Cxyz123/');
    }
  });

  test('Threads posts are read as a threads source, on either host', () => {
    const cases: Array<[string, string]> = [
      ['https://www.threads.net/@ruta/post/DFa1b2C', 'https://www.threads.com/@ruta/post/DFa1b2C'],
      ['https://www.threads.com/@ruta/post/DFa1b2C', 'https://www.threads.com/@ruta/post/DFa1b2C'],
      // Share-sheet junk and a trailing slash must not change the target.
      ['threads.com/@ruta/post/DFa1b2C/?xmt=abc', 'https://www.threads.com/@ruta/post/DFa1b2C'],
      ['https://www.threads.net/t/DFa1b2C', 'https://www.threads.com/t/DFa1b2C'],
    ];
    for (const [input, canonical] of cases) {
      const result = detectRepurposeSource(input);
      expect(result.ok, input).toBe(true);
      if (!result.ok) continue;
      expect(result.kind).toBe('threads');
      expect(result.canonicalUrl).toBe(canonical);
    }
  });

  test('TikTok videos are read as a tiktok source', () => {
    for (const url of [
      'https://www.tiktok.com/@ruta/video/7123456789012345678',
      'https://vm.tiktok.com/ZMabcdef/',
    ]) {
      const result = detectRepurposeSource(url);
      expect(result.ok, url).toBe(true);
      if (!result.ok) continue;
      expect(result.kind).toBe('tiktok');
    }
  });

  test('profiles, other platforms and junk are rejected — never silently scraped', () => {
    for (const url of [
      '',
      '   ',
      'привіт',
      'https://www.threads.com/@ruta',
      'https://www.tiktok.com/@ruta',
      'https://www.youtube.com/watch?v=abc123',
      'https://www.instagram.com/ruta/',
    ]) {
      expect(detectRepurposeSource(url).ok, url).toBe(false);
    }
  });

  test('quotes and zero-width characters from a copy-paste are tolerated', () => {
    const messy = '​"https://www.instagram.com/reel/Cxyz123/"​';
    const result = detectRepurposeSource(messy);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe('reel');
  });
});

test.describe('repurpose — target rules', () => {
  test('a source is never offered its own format', () => {
    expect(TARGETS_BY_SOURCE.reel).not.toContain('reels');
    expect(TARGETS_BY_SOURCE.tiktok).not.toContain('reels');
    expect(TARGETS_BY_SOURCE.threads).not.toContain('threads');
  });

  test('a reel offers carousel / thread / storytelling; a thread offers carousel / reel / storytelling', () => {
    expect(TARGETS_BY_SOURCE.reel).toEqual(['carousel', 'threads', 'stories']);
    expect(TARGETS_BY_SOURCE.threads).toEqual(['carousel', 'reels', 'stories']);
    // TikTok is a video source, so it behaves exactly like a reel.
    expect(TARGETS_BY_SOURCE.tiktok).toEqual(TARGETS_BY_SOURCE.reel);
  });

  test('every offered target has metadata and a rationale to show', () => {
    for (const kind of Object.keys(TARGETS_BY_SOURCE) as RepurposeSourceKind[]) {
      for (const target of TARGETS_BY_SOURCE[kind]) {
        expect(isTargetAllowed(kind, target)).toBe(true);
        const meta = REPURPOSE_TARGETS[target];
        expect(meta.label.length).toBeGreaterThan(0);
        expect(meta.rationale.length).toBeGreaterThan(0);
      }
    }
  });

  test('only Threads falls outside the app content types (it has no editor route)', () => {
    expect(isContentTypeTarget('threads')).toBe(false);
    for (const target of ['reels', 'carousel', 'stories'] as const) {
      expect(isContentTypeTarget(target)).toBe(true);
    }
  });
});

test.describe('repurpose — brief', () => {
  const base = {
    kind: 'reel' as const,
    sourceUrl: 'https://www.instagram.com/reel/Cxyz123/',
    author: 'ruta',
    text: 'Я три роки думала що треба знімати ідеально. Виявилось навпаки.',
  };

  test('carries the original words, the link and the author', () => {
    const brief = composeRepurposeBrief({ ...base, target: 'carousel' });
    expect(brief).toContain(base.text);
    expect(brief).toContain(base.sourceUrl);
    expect(brief).toContain('@ruta');
    expect(brief).toContain('КАРУСЕЛЬ');
  });

  test('an already-@-prefixed handle is not double-prefixed', () => {
    const brief = composeRepurposeBrief({ ...base, author: '@ruta', target: 'threads' });
    expect(brief).toContain('@ruta');
    expect(brief).not.toContain('@@ruta');
  });

  test('names the target format, so one source can produce several different pieces', () => {
    const carousel = composeRepurposeBrief({ ...base, target: 'carousel' });
    const reel = composeRepurposeBrief({ ...base, target: 'reels' });
    const thread = composeRepurposeBrief({ ...base, target: 'threads' });
    expect(carousel).not.toBe(reel);
    expect(reel).toContain('РІЛСУ');
    expect(thread).toContain('Threads');
  });

  test('warns the model about transcription noise for video sources only', () => {
    const fromReel = composeRepurposeBrief({ ...base, target: 'carousel' });
    const fromThread = composeRepurposeBrief({ ...base, kind: 'threads', target: 'carousel' });
    expect(fromReel).toContain('транскрипція');
    expect(fromThread).not.toContain('транскрипція');
  });

  test('a very long transcript is clipped, never sent whole', () => {
    const brief = composeRepurposeBrief({ ...base, text: 'а'.repeat(20_000), target: 'carousel' });
    expect(brief.length).toBeLessThan(14_000);
    expect(brief).toContain('…');
  });

  test('the caption is included when a video had one', () => {
    const brief = composeRepurposeBrief({ ...base, target: 'carousel', caption: 'зберігай собі' });
    expect(brief).toContain('зберігай собі');
  });

  test('the saved source is named after what it actually is', () => {
    expect(repurposeSourceTitle('reel', 'ruta')).toBe('Переробка: Instagram Reel · @ruta');
    expect(repurposeSourceTitle('threads', null)).toBe('Переробка: Threads');
  });
});

test.describe('repurpose — thread output', () => {
  test('posts over the Threads limit are clamped, not shipped broken', () => {
    const posts = normalizeThreadPosts(['я'.repeat(900)]);
    expect(posts).toHaveLength(1);
    expect(posts[0].length).toBeLessThanOrEqual(THREADS_POST_CHAR_LIMIT);
    expect(posts[0].endsWith('…')).toBe(true);
  });

  test('"1/7" counters the prompt bans are stripped if the model adds them anyway', () => {
    expect(normalizeThreadPosts(['1/3 перша думка', '2 / 3 — друга', '3\\3. третя'])).toEqual([
      'перша думка',
      'друга',
      'третя',
    ]);
  });

  test('empty entries and non-strings are dropped; the count is capped', () => {
    expect(normalizeThreadPosts(['  ', null, 42, { text: 'з обʼєкта' }, 'справжній'])).toEqual([
      'з обʼєкта',
      'справжній',
    ]);
    expect(normalizeThreadPosts(Array.from({ length: 30 }, (_, i) => `пост ${i}`))).toHaveLength(
      THREAD_MAX_POSTS,
    );
    expect(normalizeThreadPosts('not an array')).toEqual([]);
  });

  test('an untitled thread is named by how it opens', () => {
    expect(deriveThreadTitle('  Мій тред  ', ['перший'])).toBe('Мій тред');
    expect(deriveThreadTitle(null, ['Коротка перша думка'])).toBe('Коротка перша думка');
    expect(deriveThreadTitle(null, ['я'.repeat(200)]).length).toBeLessThanOrEqual(60);
    expect(deriveThreadTitle(null, [])).toBe('Тред');
  });
});
