/**
 * Splitting and joining a block's text, with its attachments carried along.
 *
 * A paragraph IS a block. Pressing Enter splits the one you are in; backspacing
 * at the very start joins it back into the one above. That is the whole of what
 * «Наговорити» and «По сценах» disagree about — one draws the blocks as flowing
 * paragraphs, the other as numbered cards — so the switch between the two views
 * needs no conversion at all and cannot lose anything.
 *
 * The part that CAN lose something is the attachments. An overlay is anchored
 * by a character offset into its block's text, so text moving between blocks
 * without its anchors being re-based leaves every attachment pointing at the
 * wrong words, or at nothing. Both directions are re-based here, and the specs
 * check that a split followed by a join is the identity.
 *
 * Pure — no React, no database.
 */

import type { Overlay, ReelBlock } from './blocks';

/** What the two halves of a split contain. */
export type SplitResult = {
  /** Stays in the original block. */
  head: { spoken: string; overlays: Overlay[] };
  /** Becomes the new block below it. */
  tail: { spoken: string; overlays: Overlay[] };
};

/**
 * Cut a block in two at `at`.
 *
 * An overlay lands wherever its anchor STARTS. One straddling the cut goes with
 * its opening words and keeps its full phrase, so `resolveOverlays` will fail to
 * match it exactly and fall back to searching — it detaches visibly rather than
 * silently re-anchoring onto half a phrase somewhere else.
 */
export function splitBlockText(block: Pick<ReelBlock, 'spoken' | 'overlays'>, at: number): SplitResult {
  const text = block.spoken ?? '';
  const cut = Math.max(0, Math.min(at, text.length));

  const head: Overlay[] = [];
  const tail: Overlay[] = [];
  for (const o of block.overlays) {
    if (o.anchorStart < cut) head.push(o);
    else tail.push({ ...o, anchorStart: o.anchorStart - cut });
  }

  return {
    head: { spoken: text.slice(0, cut), overlays: head },
    tail: { spoken: text.slice(cut), overlays: tail },
  };
}

/**
 * Join `next` onto the end of `prev`.
 *
 * `joinAt` is where the seam falls in the joined text — the caret position the
 * editor restores to, and the offset every incoming anchor shifts by.
 */
export type MergeResult = {
  spoken: string;
  overlays: Overlay[];
  joinAt: number;
};

export function mergeBlockText(
  prev: Pick<ReelBlock, 'spoken' | 'overlays'>,
  next: Pick<ReelBlock, 'spoken' | 'overlays'>,
): MergeResult {
  const head = prev.spoken ?? '';
  const tail = next.spoken ?? '';

  return {
    spoken: head + tail,
    overlays: [
      ...prev.overlays,
      ...next.overlays.map((o) => ({ ...o, anchorStart: o.anchorStart + head.length })),
    ],
    joinAt: head.length,
  };
}

/**
 * The blocks a reel should have after a split, in order.
 *
 * Returned as plain patches rather than applied in place so the caller can send
 * the same values to the screen and to the database without deriving them
 * twice.
 */
export type BlockOrder = { id: string; orderIndex: number };

/** Renumber ids into 0..n-1, which is the only ordering the table stores. */
export function renumber(ids: readonly string[]): BlockOrder[] {
  return ids.map((id, orderIndex) => ({ id, orderIndex }));
}

/**
 * Move one block up or down.
 *
 * Dragging is never the only way to reorder — on a phone, with the keyboard up
 * and a list taller than the viewport, a drag is a fight. So the arrows and the
 * drag both come through here and cannot disagree about the result.
 */
export function moveBlock(ids: readonly string[], id: string, direction: -1 | 1): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];
  const to = from + direction;
  if (to < 0 || to >= ids.length) return [...ids];

  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * A new attachment on the selected phrase.
 *
 * `anchorStart` is the selection's own offset, which is exact right now; the
 * phrase is what finds it again after the text above it changes. Both are
 * stored because each fails in a case the other survives — see `resolveOverlays`.
 */
export function overlayForSelection(
  id: string,
  kind: Overlay['kind'],
  text: string,
  start: number,
  end: number,
): Overlay {
  return {
    id,
    kind,
    anchorText: text.slice(start, end),
    anchorStart: start,
    note: '',
  };
}
