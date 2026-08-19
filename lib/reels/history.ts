/**
 * Undo for the note.
 *
 * She selected what she thought was one paragraph, the handles took two, and
 * she deleted both — with no way back. A textarea has native undo, but a
 * React-controlled one does not (every keystroke replaces the value, so the
 * browser's own stack is meaningless), and on a phone there is no Ctrl+Z to
 * reach for anyway.
 *
 * WHEN TO CHECKPOINT is the whole design. Snapshotting every keystroke makes
 * undo useless — twenty presses to get back one sentence. Snapshotting only on
 * a timer misses the case that matters, which is a big delete landing in one
 * event. So both:
 *
 *   • a PAUSE — she stopped typing, so what came before was a finished thought;
 *   • a BIG CHANGE — a lot of text appeared or vanished at once, which is a
 *     paste, a dictation, or exactly the accident this exists for.
 *
 * Pure, so the rule can be tested without a keyboard.
 */

import type { Overlay } from './blocks';

/** A moment worth being able to return to. */
export type Snapshot = {
  text: string;
  overlays: Overlay[];
  /** When it was taken, for the pause rule. Passed in — never read from a clock. */
  at: number;
};

/** Anything this much text appearing or vanishing at once is a checkpoint. */
export const BIG_CHANGE_CHARS = 12;

/** A gap this long means the previous state was a finished thought. */
export const PAUSE_MS = 900;

/**
 * Should the state BEFORE this edit be kept?
 *
 * `previous` is the last snapshot taken; `next` is what the text is becoming.
 */
export function shouldCheckpoint(
  previous: Snapshot | undefined,
  nextText: string,
  now: number,
): boolean {
  if (!previous) return true;
  if (previous.text === nextText) return false;

  const sizeChange = Math.abs(nextText.length - previous.text.length);
  if (sizeChange >= BIG_CHANGE_CHARS) return true;

  return now - previous.at >= PAUSE_MS;
}

/** How many steps back the note can go. Enough for a session, bounded for memory. */
export const MAX_HISTORY = 50;

/**
 * Add a snapshot, oldest dropped past the cap.
 *
 * Never records the same text twice in a row: an undo that does nothing
 * visible is indistinguishable from a broken button.
 */
export function pushSnapshot(history: readonly Snapshot[], snapshot: Snapshot): Snapshot[] {
  const last = history[history.length - 1];
  if (last && last.text === snapshot.text) return [...history];
  const next = [...history, snapshot];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

/**
 * Step back one.
 *
 * Returns the state to restore and the history that remains. A snapshot equal
 * to what is already on screen is skipped rather than "used up", so pressing
 * undo always changes something.
 */
export function undo(
  history: readonly Snapshot[],
  currentText: string,
): { restored: Snapshot; history: Snapshot[] } | null {
  const rest = [...history];
  while (rest.length > 0) {
    const candidate = rest.pop()!;
    if (candidate.text !== currentText) return { restored: candidate, history: rest };
  }
  return null;
}

/** «Скасувати» is only worth showing when it would do something. */
export function canUndo(history: readonly Snapshot[], currentText: string): boolean {
  return history.some((s) => s.text !== currentText);
}
