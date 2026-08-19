import { test, expect } from '@playwright/test';
import {
  BIG_CHANGE_CHARS,
  MAX_HISTORY,
  canUndo,
  pushSnapshot,
  shouldCheckpoint,
  undo,
  type Snapshot,
} from '@/lib/reels/history';

/**
 * The accident this exists for: she meant to select one paragraph, the handles
 * took two, and she deleted both. Undo has to bring back exactly that — one
 * press, not twenty.
 */

const snap = (text: string, at = 0): Snapshot => ({ text, overlays: [], at });

test('the first edit is always worth a checkpoint', () => {
  expect(shouldCheckpoint(undefined, 'щось', 0)).toBe(true);
});

test('a big deletion checkpoints immediately, however fast it followed', () => {
  const before = snap('Перший абзац тут.\n\nДругий абзац тут.', 1000);
  // Both paragraphs gone in one event, 10ms after the last snapshot.
  expect(shouldCheckpoint(before, '', 1010)).toBe(true);
});

test('a paste checkpoints too — it is the same event, in the other direction', () => {
  const before = snap('коротко', 1000);
  expect(shouldCheckpoint(before, `коротко${'x'.repeat(BIG_CHANGE_CHARS)}`, 1010)).toBe(true);
});

test('typing a few letters in a burst does NOT checkpoint', () => {
  // Twenty presses to undo one sentence is not undo.
  const before = snap('текст', 1000);
  expect(shouldCheckpoint(before, 'текстa', 1050)).toBe(false);
  expect(shouldCheckpoint(before, 'текстaб', 1100)).toBe(false);
});

test('a pause makes the previous state a checkpoint', () => {
  const before = snap('текст', 1000);
  expect(shouldCheckpoint(before, 'текстa', 1000 + 900)).toBe(true);
});

test('no change is never a checkpoint', () => {
  const before = snap('текст', 1000);
  expect(shouldCheckpoint(before, 'текст', 99999)).toBe(false);
});

test('undo brings back the deleted paragraphs', () => {
  const full = 'Перший абзац тут.\n\nДругий абзац тут.';
  const history = pushSnapshot([], snap(full, 0));

  const stepped = undo(history, '');
  expect(stepped).not.toBeNull();
  expect(stepped!.restored.text).toBe(full);
  expect(stepped!.history).toHaveLength(0);
});

test('undo walks back through several steps', () => {
  let history: Snapshot[] = [];
  history = pushSnapshot(history, snap('один', 0));
  history = pushSnapshot(history, snap('один два', 1000));
  history = pushSnapshot(history, snap('один два три', 2000));

  const first = undo(history, 'один два три чотири')!;
  expect(first.restored.text).toBe('один два три');
  const second = undo(first.history, first.restored.text)!;
  expect(second.restored.text).toBe('один два');
});

test('a snapshot matching what is on screen is skipped, so undo always does something', () => {
  let history: Snapshot[] = [];
  history = pushSnapshot(history, snap('старе', 0));
  history = pushSnapshot(history, snap('нове', 1000));

  const stepped = undo(history, 'нове')!;
  expect(stepped.restored.text).toBe('старе');
});

test('undo with nothing to go back to returns null rather than a no-op state', () => {
  const history = pushSnapshot([], snap('те саме', 0));
  expect(undo(history, 'те саме')).toBeNull();
  expect(canUndo(history, 'те саме')).toBe(false);
  expect(canUndo(history, 'щось інше')).toBe(true);
});

test('the same text is never recorded twice in a row', () => {
  let history: Snapshot[] = [];
  history = pushSnapshot(history, snap('текст', 0));
  history = pushSnapshot(history, snap('текст', 1000));
  expect(history).toHaveLength(1);
});

test('history is bounded, dropping the oldest', () => {
  let history: Snapshot[] = [];
  for (let i = 0; i < MAX_HISTORY + 10; i++) history = pushSnapshot(history, snap(`крок ${i}`, i));
  expect(history).toHaveLength(MAX_HISTORY);
  expect(history[history.length - 1].text).toBe(`крок ${MAX_HISTORY + 9}`);
});

test('attachments come back with the text they belong to', () => {
  const overlays = [{ id: 'o1', kind: 'text' as const, anchorText: 'абзац', anchorStart: 8, note: '' }];
  const history = pushSnapshot([], { text: 'Перший абзац.', overlays, at: 0 });
  const stepped = undo(history, '')!;
  expect(stepped.restored.overlays).toHaveLength(1);
  expect(stepped.restored.overlays[0].id).toBe('o1');
});
