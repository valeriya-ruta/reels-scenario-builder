import { test, expect } from '@playwright/test';
import { editTimeline, blockSeconds, blockStarts } from '@/lib/reels/timeline';
import { emptyBlock, WORDS_PER_SECOND, type Overlay, type ReelBlock } from '@/lib/reels/blocks';

/**
 * The timecodes on «Що поверх» are the one number in the app nobody types. They
 * have to be derived from the words alone, and they have to READ down the page
 * in the order the editor will meet them.
 */

/** 26 words ≈ 10s at 2.6 w/s — round numbers make the expectations readable. */
const TEN_SECONDS = Array.from({ length: 26 }, (_, i) => `слово${i + 1}`).join(' ');

function talk(spoken: string | null, i = 0, overlays: Overlay[] = []): ReelBlock {
  return { ...emptyBlock('talk', 'p1', i, `b${i}`), spoken, overlays };
}

function mark(id: string, anchorText: string, anchorStart: number, note = ''): Overlay {
  return { id, anchorText, anchorStart, kind: 'text', note };
}

test('pace comes from one constant, shared with the duration chip', () => {
  expect(WORDS_PER_SECOND).toBe(2.6);
  expect(blockSeconds(talk(TEN_SECONDS))).toBe(10);
});

test('a silent card still holds the screen, so later blocks shift', () => {
  const clip: ReelBlock = {
    ...emptyBlock('broll', 'p1', 1, 'b1'),
    clips: [{ id: 'c1', what: 'Мем' }],
  };
  expect(blockStarts([talk(TEN_SECONDS, 0), clip, talk(TEN_SECONDS, 2)])).toEqual([0, 10, 12]);
});

test('an overlay is timed by the words BEFORE its phrase, not by its block', () => {
  // "один два три чотири пʼять" — the mark sits on «пʼять», 4 words in.
  const text = 'один два три чотири пʼять';
  const at = text.indexOf('пʼять');
  const [item] = editTimeline([talk(text, 0, [mark('o1', 'пʼять', at, 'напис')])]);

  // 4 words / 2.6 ≈ 1.54 → 2s.
  expect(item.atSec).toBe(2);
  expect(item.timecode).toBe('0:02');
});

test('timecodes accumulate across blocks', () => {
  const second = `${TEN_SECONDS} кінець`;
  const at = second.indexOf('кінець');
  const items = editTimeline([
    talk(TEN_SECONDS, 0),
    talk(second, 1, [mark('o1', 'кінець', at, 'напис')]),
  ]);

  expect(items).toHaveLength(1);
  expect(items[0].atSec).toBe(20); // 10s of block one + 10s into block two
  expect(items[0].timecode).toBe('0:20');
});

test('two marks in one block are listed in the order they are spoken', () => {
  const text = `перше ${TEN_SECONDS} останнє`;
  const items = editTimeline([
    talk(text, 0, [
      // Attached in the wrong order on purpose: the list must not echo it.
      mark('late', 'останнє', text.indexOf('останнє'), 'другий'),
      mark('early', 'перше', text.indexOf('перше'), 'перший'),
    ]),
  ]);

  expect(items.map((i) => i.slot)).toEqual(['edit:ov:early', 'edit:ov:late']);
  expect(items[0].atSec).toBeLessThan(items[1].atSec);
});

test('a mark whose phrase moved is timed where the phrase is now', () => {
  const text = 'нове речення спереду і потім дванадцять тижнів';
  // anchorStart is stale (0), but the phrase is findable further along.
  const [item] = editTimeline([talk(text, 0, [mark('o1', 'дванадцять тижнів', 0, 'напис')])]);

  // 5 words precede it → 5/2.6 ≈ 1.9 → 2s. Not 0, which the stale offset says.
  expect(item.atSec).toBe(2);
});

test('a mark whose phrase is gone falls back to its block, never vanishes', () => {
  const items = editTimeline([
    talk(TEN_SECONDS, 0),
    talk('щось інше', 1, [mark('o1', 'фрази більше немає', 4, 'напис')]),
  ]);

  expect(items).toHaveLength(1);
  expect(items[0].atSec).toBe(10);
});

test('the instruction text itself carries the cue, in her own words', () => {
  const text = 'річ у дванадцяти тижнях';
  const [item] = editTimeline([
    talk(text, 0, [mark('o1', 'дванадцяти тижнях', text.indexOf('дванадцяти'), '«12 тижнів = 1 рік»')]),
  ]);

  expect(item.what).toContain('дванадцяти тижнях');
  expect(item.what).toContain('12 тижнів = 1 рік');
});

/**
 * A trend reel: a handful of clips, a caption over each, a trending sound, and
 * nothing said out loud. `emptyBlock` starts a cutaway at «голос продовжується
 * поверх» — right when a cutaway interrupts someone talking, wrong here, where
 * there is no voice to continue. The customer app therefore creates these
 * blocks with no sound of their own and sets the trend ONCE on the reel.
 */
function trendClips(): ReelBlock {
  return {
    ...emptyBlock('broll', 'p1', 0, 'b0'),
    audioSource: null,
    clips: [
      { id: 'c1', what: 'Мем із котом', screenText: 'коли понеділок' },
      { id: 'c2', what: 'Друге відео', screenText: 'коли пʼятниця' },
    ],
  };
}

test('a wordless trend reel still gets a list, one entry per caption', () => {
  const items = editTimeline([trendClips()], 'trend');

  expect(items).toHaveLength(2);
  expect(items[0].timecode).toBe('0:00');
  expect(items.map((i) => i.what).join(' ')).toContain('коли пʼятниця');
});

test('a trend reel is never told a voice continues over it', () => {
  const items = editTimeline([trendClips()], 'trend');
  expect(items.map((i) => i.slot)).not.toContain('edit:audio');
  expect(items.map((i) => i.what).join(' ')).not.toContain('Голос');
});

test("the reel's trending sound is stated once, not on every clip", () => {
  const second: ReelBlock = { ...trendClips(), id: 'b1', orderIndex: 1 };
  const items = editTimeline([trendClips(), second], 'trend');

  expect(items.filter((i) => i.what.includes('Трендовий звук'))).toHaveLength(0);
});
