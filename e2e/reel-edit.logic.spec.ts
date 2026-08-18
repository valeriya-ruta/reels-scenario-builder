import { test, expect } from '@playwright/test';
import {
  splitBlockText,
  mergeBlockText,
  moveBlock,
  renumber,
  overlayForSelection,
} from '@/lib/reels/edit';
import type { Overlay } from '@/lib/reels/blocks';

/**
 * «Наговорити» and «По сценах» are two drawings of the same blocks, so the
 * switch between them is only safe if splitting and joining lose nothing. What
 * can be lost is not the text — it is the attachments, whose anchors are
 * offsets into the text that just moved.
 */

function mark(id: string, anchorText: string, anchorStart: number): Overlay {
  return { id, anchorText, anchorStart, kind: 'text', note: '' };
}

const TEXT = 'Річ не в дисципліні. Річ у дванадцяти тижнях.';
const CUT = TEXT.indexOf('Річ у');

test('splitting cuts the text where the caret was', () => {
  const { head, tail } = splitBlockText({ spoken: TEXT, overlays: [] }, CUT);
  expect(head.spoken + tail.spoken).toBe(TEXT);
  expect(tail.spoken).toBe('Річ у дванадцяти тижнях.');
});

test('an attachment goes with its own half, re-based to it', () => {
  const at = TEXT.indexOf('дванадцяти');
  const { head, tail } = splitBlockText(
    { spoken: TEXT, overlays: [mark('a', 'дисципліні', TEXT.indexOf('дисципліні')), mark('b', 'дванадцяти', at)] },
    CUT,
  );

  expect(head.overlays.map((o) => o.id)).toEqual(['a']);
  expect(tail.overlays.map((o) => o.id)).toEqual(['b']);
  // Re-based: the anchor must still point at its phrase in the NEW text.
  expect(tail.spoken.slice(tail.overlays[0].anchorStart)).toMatch(/^дванадцяти/);
});

test('joining puts the text back and shifts the incoming anchors', () => {
  const { head, tail } = splitBlockText(
    { spoken: TEXT, overlays: [mark('b', 'дванадцяти', TEXT.indexOf('дванадцяти'))] },
    CUT,
  );
  const merged = mergeBlockText(head, tail);

  expect(merged.spoken).toBe(TEXT);
  expect(merged.joinAt).toBe(CUT);
  expect(merged.spoken.slice(merged.overlays[0].anchorStart)).toMatch(/^дванадцяти/);
});

test('split then join is the identity — text and every anchor', () => {
  const overlays = [
    mark('a', 'Річ', 0),
    mark('b', 'дисципліні', TEXT.indexOf('дисципліні')),
    mark('c', 'тижнях', TEXT.indexOf('тижнях')),
  ];

  // Every possible cut, not just a convenient one.
  for (let at = 0; at <= TEXT.length; at++) {
    const { head, tail } = splitBlockText({ spoken: TEXT, overlays }, at);
    const merged = mergeBlockText(head, tail);

    expect(merged.spoken).toBe(TEXT);
    expect(merged.overlays.map((o) => o.id).sort()).toEqual(['a', 'b', 'c']);
    for (const o of merged.overlays) {
      expect(merged.spoken.slice(o.anchorStart, o.anchorStart + o.anchorText.length)).toBe(
        o.anchorText,
      );
    }
  }
});

test('splitting at the very start leaves an empty first half, not a lost one', () => {
  const { head, tail } = splitBlockText({ spoken: TEXT, overlays: [mark('a', 'Річ', 0)] }, 0);
  expect(head.spoken).toBe('');
  expect(tail.spoken).toBe(TEXT);
  expect(tail.overlays).toHaveLength(1);
});

test('a caret beyond the text cannot cut outside it', () => {
  const { head, tail } = splitBlockText({ spoken: TEXT, overlays: [] }, 9999);
  expect(head.spoken).toBe(TEXT);
  expect(tail.spoken).toBe('');
});

test('joining an empty block adds nothing and moves nothing', () => {
  const merged = mergeBlockText(
    { spoken: TEXT, overlays: [mark('a', 'Річ', 0)] },
    { spoken: '', overlays: [] },
  );
  expect(merged.spoken).toBe(TEXT);
  expect(merged.overlays[0].anchorStart).toBe(0);
});

test('up and down move one place and stop at the ends', () => {
  const ids = ['a', 'b', 'c'];
  expect(moveBlock(ids, 'b', -1)).toEqual(['b', 'a', 'c']);
  expect(moveBlock(ids, 'b', 1)).toEqual(['a', 'c', 'b']);
  expect(moveBlock(ids, 'a', -1)).toEqual(ids);
  expect(moveBlock(ids, 'c', 1)).toEqual(ids);
});

test('moving never mutates the list it was given', () => {
  const ids = ['a', 'b', 'c'];
  moveBlock(ids, 'a', 1);
  expect(ids).toEqual(['a', 'b', 'c']);
});

test('renumbering is always a dense 0..n-1', () => {
  expect(renumber(['x', 'y', 'z'])).toEqual([
    { id: 'x', orderIndex: 0 },
    { id: 'y', orderIndex: 1 },
    { id: 'z', orderIndex: 2 },
  ]);
});

test('an attachment records the phrase, not just where it was', () => {
  const o = overlayForSelection('o1', 'image', TEXT, TEXT.indexOf('дванадцяти'), TEXT.indexOf(' тижнях'));
  expect(o.anchorText).toBe('дванадцяти');
  expect(TEXT.slice(o.anchorStart, o.anchorStart + o.anchorText.length)).toBe('дванадцяти');
  expect(o.kind).toBe('image');
});
