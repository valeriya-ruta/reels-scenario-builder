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

/**
 * Re-home attachments after the text has been rewritten.
 *
 * «Зробити рілс» hands back a different script: shorter, reordered, with a hook
 * in front. The old anchors point into text that no longer exists, so without
 * this every attachment she made would come back detached — the app would have
 * quietly thrown away the only part of the reel it cannot regenerate.
 *
 * Each one goes to the paragraph that still contains its phrase. One whose
 * words the rewrite removed lands on the nearest paragraph by position and is
 * left detached: shown, flagged, and hers to fix. Silently dropping an editing
 * instruction is the one outcome that is never acceptable.
 */
export function redistributeOverlays(
  paragraphs: readonly string[],
  overlays: readonly Overlay[],
): Overlay[][] {
  const out: Overlay[][] = paragraphs.map(() => []);
  if (paragraphs.length === 0) return out;

  for (const o of overlays) {
    const phrase = (o.anchorText ?? '').trim();
    let target = -1;
    let at = -1;

    if (phrase) {
      for (let i = 0; i < paragraphs.length; i++) {
        const found = paragraphs[i].indexOf(phrase);
        if (found !== -1) {
          target = i;
          at = found;
          break;
        }
      }
    }

    if (target === -1) {
      // Nowhere to anchor: keep it near where it used to be so it is at least
      // in the right half of the reel when she goes looking for it.
      target = Math.min(paragraphs.length - 1, Math.max(0, out.findIndex((l) => l.length === 0)));
      if (target < 0) target = paragraphs.length - 1;
      at = 0;
    }

    out[target].push({ ...o, anchorStart: at });
  }

  return out;
}

/**
 * Put `insert` into `text` at `at`, and say where the caret ends up.
 *
 * This is what dictation does: she taps the mic mid-sentence and the words land
 * where she was, not at the end. Anchors after the insertion point shift by its
 * length, or they would slide onto the wrong words.
 */
export function insertAt(
  text: string,
  at: number,
  insert: string,
  overlays: readonly Overlay[] = [],
): { text: string; caret: number; span: { start: number; length: number }; overlays: Overlay[] } {
  const cut = Math.max(0, Math.min(at, text.length));
  const before = text.slice(0, cut);
  const after = text.slice(cut);

  // A dictated sentence needs a space against what it lands on, but not a
  // doubled one, and not one at the very start of an empty note.
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const tail = after && !/^\s/.test(after) ? ' ' : '';
  const piece = `${lead}${insert}${tail}`;

  return {
    text: `${before}${piece}${after}`,
    caret: cut + lead.length + insert.length,
    // Where the dictated words themselves ended up, without the spacing added
    // around them. Dictation comes back a second time with a more accurate
    // reading of the same take, and this is the span it swaps.
    span: { start: cut + lead.length, length: insert.length },
    overlays: overlays.map((o) =>
      o.anchorStart >= cut ? { ...o, anchorStart: o.anchorStart + piece.length } : o,
    ),
  };
}

/**
 * Swap one known stretch of the note for different words.
 *
 * Used when the accurate transcription of a take arrives after the provisional
 * one is already on screen. The caller checks first that the span still holds
 * what it put there — if she has typed into those words, they are hers now and
 * no better transcript gets to overwrite them.
 */
export function replaceRange(
  text: string,
  start: number,
  length: number,
  replacement: string,
  overlays: readonly Overlay[] = [],
): { text: string; caret: number; overlays: Overlay[] } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(from + length, text.length));
  const shift = replacement.length - (to - from);

  return {
    text: `${text.slice(0, from)}${replacement}${text.slice(to)}`,
    caret: from + replacement.length,
    overlays: overlays.map((o) => {
      // An anchor INSIDE the replaced words has lost what it pointed at. It
      // collapses to the start of the new text rather than drifting somewhere
      // arbitrary further down the note.
      if (o.anchorStart >= to) return { ...o, anchorStart: o.anchorStart + shift };
      if (o.anchorStart > from) return { ...o, anchorStart: from };
      return o;
    }),
  };
}
