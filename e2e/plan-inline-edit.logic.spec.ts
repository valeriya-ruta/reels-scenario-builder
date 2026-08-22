import { test, expect } from '@playwright/test';
import {
  diffBlocks,
  diffStories,
  docIsDirty,
  emptyBlock,
  emptyStory,
  hasChanges,
  toEditableBlock,
  toEditableStory,
  type EditableBlock,
  type EditableDoc,
  type EditableStory,
} from '../lib/plan/editableDoc';

/**
 * Core-logic spec for editing a piece BESIDE the calendar.
 *
 * The panel's textareas are not the risky part — the diff is. Save turns a
 * draft into inserts, updates, deletes and a new order, and a diff that is
 * wrong here loses writing silently: a moved block read as delete-plus-insert
 * would take its identity with it, and with it every tick already made on the
 * shared shot list.
 */

function story(id: string, text: string): EditableStory {
  return { id, text, visual: null, engagement: null };
}

function block(id: string, spoken: string): EditableBlock {
  return { ...emptyBlock(id), spoken };
}

test.describe('reading rows into a draft', () => {
  test('a reel block arrives under the column names the database uses', () => {
    const parsed = toEditableBlock({
      id: 'b1',
      kind: 'broll',
      spoken: 'текст',
      screen_text: 'НАПИС',
      record_note: 'крупний план',
      asset_note: 'знайти відео',
      edit_note: 'швидкий кат',
      clips: [{ id: 'c1' }, { id: 'c2' }],
    });
    expect(parsed).toMatchObject({
      id: 'b1',
      kind: 'broll',
      screenText: 'НАПИС',
      recordNote: 'крупний план',
      assetNote: 'знайти відео',
      editNote: 'швидкий кат',
      clipCount: 2,
    });
  });

  test('an unrecognised kind reads as talk rather than breaking the panel', () => {
    expect(toEditableBlock({ id: 'b', kind: 'mystery' }).kind).toBe('talk');
  });

  test('a story keeps only the visual/engagement values that really exist', () => {
    expect(toEditableStory({ id: 's', text: 'x', visual: 'Гарне фото', engagement: 'nope' })).toEqual({
      id: 's',
      text: 'x',
      visual: 'Гарне фото',
      engagement: null,
    });
  });

  test('missing columns read as empty, never as undefined', () => {
    expect(toEditableStory({ id: 's' })).toEqual({ id: 's', text: '', visual: null, engagement: null });
  });
});

test.describe('the diff Save sends', () => {
  const original = [story('a', 'перша'), story('b', 'друга'), story('c', 'третя')];

  test('an untouched draft writes nothing at all', () => {
    const edits = diffStories(original, [...original]);
    expect(hasChanges(edits)).toBe(false);
    expect(edits.order).toBeNull();
  });

  test('an edited row is an update, not a replacement', () => {
    const edits = diffStories(original, [original[0], { ...original[1], text: 'інша' }, original[2]]);
    expect(edits.updated).toEqual([{ ...original[1], text: 'інша' }]);
    expect(edits.created).toHaveLength(0);
    expect(edits.deleted).toHaveLength(0);
    // Nothing moved, so the order does not need rewriting.
    expect(edits.order).toBeNull();
  });

  test('an added row carries the position it was added at', () => {
    const fresh = emptyStory('new');
    const edits = diffStories(original, [original[0], fresh, original[1], original[2]]);
    expect(edits.created).toEqual([{ ...fresh, orderIndex: 1 }]);
    // Inserting shifts everything after it, so the order is rewritten.
    expect(edits.order).toEqual(['a', 'new', 'b', 'c']);
  });

  test('a removed row is deleted and the rest are renumbered', () => {
    const edits = diffStories(original, [original[0], original[2]]);
    expect(edits.deleted).toEqual(['b']);
    expect(edits.order).toEqual(['a', 'c']);
  });

  test('MOVING a row is a reorder — never a delete plus an insert', () => {
    // This is the one that matters: a re-created block would lose its id, and
    // with it the progress ticked off against it on the shared shot list.
    const edits = diffStories(original, [original[1], original[0], original[2]]);
    expect(edits.created).toHaveLength(0);
    expect(edits.deleted).toHaveLength(0);
    expect(edits.updated).toHaveLength(0);
    expect(edits.order).toEqual(['b', 'a', 'c']);
  });

  test('everything at once still comes out coherent', () => {
    const fresh = emptyBlock('new');
    const before = [block('x', 'один'), block('y', 'два'), block('z', 'три')];
    const after = [{ ...before[2], spoken: 'ТРИ' }, fresh, before[0]];
    const edits = diffBlocks(before, after);

    expect(edits.created).toEqual([{ ...fresh, orderIndex: 1 }]);
    expect(edits.updated).toEqual([{ ...before[2], spoken: 'ТРИ' }]);
    expect(edits.deleted).toEqual(['y']);
    expect(edits.order).toEqual(['z', 'new', 'x']);
  });

  test('a block is compared on what the panel can change, not on what it cannot', () => {
    // clipCount is read-only here (cutaway shots live in the full editor), so a
    // difference in it must not fabricate an update that would write nothing.
    const before = [block('x', 'один')];
    const after = [{ ...before[0], clipCount: 5 }];
    expect(hasChanges(diffBlocks(before, after))).toBe(false);
  });
});

test.describe('is there anything to save', () => {
  const doc: EditableDoc = {
    kind: 'story',
    id: 'p1',
    name: 'Понеділок',
    columnId: 'c1',
    stories: [story('a', 'перша')],
  };

  test('an untouched document is not dirty', () => {
    expect(docIsDirty(doc, { ...doc, stories: [...doc.stories] })).toBe(false);
  });

  test('renaming counts', () => {
    expect(docIsDirty(doc, { ...doc, name: 'Вівторок' })).toBe(true);
  });

  test('changing a story counts', () => {
    expect(docIsDirty(doc, { ...doc, stories: [story('a', 'перша!')] })).toBe(true);
  });

  test("a reel's brief counts, on its own", () => {
    const reel: EditableDoc = {
      kind: 'reel',
      id: 'r1',
      name: 'Рілс',
      overview: 'про каву',
      blocks: [block('x', 'один')],
    };
    expect(docIsDirty(reel, { ...reel, overview: 'про чай' })).toBe(true);
    expect(docIsDirty(reel, { ...reel, blocks: [...reel.blocks] })).toBe(false);
  });
});
