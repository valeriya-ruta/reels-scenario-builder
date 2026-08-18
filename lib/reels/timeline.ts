/**
 * «Що поверх» — the editing list with a clock against it.
 *
 * `editList` in ./blocks answers WHAT the editor does and in WHICH block, but
 * a block index is not a time: an editor scrubbing a take needs «0:11», not
 * «блок 2». Nobody types those seconds — they are derived from how far into the
 * spoken words each anchored phrase sits, at the same pace the duration chip
 * uses.
 *
 * The estimate is honest about being one: it assumes an even delivery, so a
 * long pause pushes everything after it later than the list says. That is still
 * far more use than no timecode at all, and the screen labels it «оцінка».
 *
 * Pure, so the timecodes on the shared page and the ones in the builder cannot
 * disagree.
 */

import {
  editItemsForBlock,
  resolveOverlays,
  formatDuration,
  WORDS_PER_SECOND,
  SILENT_BLOCK_SECONDS,
  type AudioSource,
  type EditItem,
  type ReelBlock,
} from './blocks';

/** An editing instruction, plus roughly when in the reel it lands. */
export type TimedEditItem = EditItem & {
  /** Seconds from the start of the reel. */
  atSec: number;
  /** «0:11» — the same value, ready to render. */
  timecode: string;
};

const WORDS = /\s+/;

function wordCount(text: string): number {
  return text.split(WORDS).filter(Boolean).length;
}

/** How long a block runs — spoken pace, or the beat a silent card holds. */
export function blockSeconds(b: ReelBlock): number {
  const words = wordCount((b.spoken ?? '').trim());
  if (words === 0) return SILENT_BLOCK_SECONDS;
  return Math.max(1, Math.round(words / WORDS_PER_SECOND));
}

/**
 * Seconds from the start of the reel to each block, by index.
 *
 * Returned as a list rather than recomputed per lookup so a reel with many
 * overlays does not walk the blocks once per instruction.
 */
export function blockStarts(blocks: ReadonlyArray<ReelBlock>): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const b of blocks) {
    starts.push(cursor);
    cursor += blockSeconds(b);
  }
  return starts;
}

/**
 * Where inside its block an overlay lands, in seconds.
 *
 * Measured in WORDS before the anchor rather than characters: a character
 * offset makes a long word take as long to say as a short sentence. The
 * position comes from `resolveOverlays`, so an overlay whose phrase has moved
 * since it was attached is timed where the phrase is NOW — and one whose phrase
 * is gone falls back to the top of its block instead of disappearing.
 */
function overlayOffsets(b: ReelBlock): Map<string, number> {
  const text = b.spoken ?? '';
  const out = new Map<string, number>();
  for (const o of resolveOverlays(text, b.overlays)) {
    const start = o.start;
    if (start === null) {
      out.set(o.id, 0);
      continue;
    }
    out.set(o.id, Math.round(wordCount(text.slice(0, start)) / WORDS_PER_SECOND));
  }
  return out;
}

const OVERLAY_SLOT = /^edit:ov:(.+)$/;

/**
 * The whole editing list, in the order it happens.
 *
 * Sorted by time rather than by the order `editItemsForBlock` happens to emit
 * in: within one block a caption attached to the last sentence must not be
 * listed above one attached to the first, or the list stops being something you
 * can work down.
 */
export function editTimeline(
  blocks: ReadonlyArray<ReelBlock>,
  reelAudio?: AudioSource | null,
): TimedEditItem[] {
  const starts = blockStarts(blocks);
  const out: TimedEditItem[] = [];

  blocks.forEach((b, i) => {
    const base = starts[i];
    const offsets = overlayOffsets(b);
    const items = editItemsForBlock(b, i + 1, reelAudio).map((item, seq) => {
      const anchored = OVERLAY_SLOT.exec(item.slot);
      const within = anchored ? (offsets.get(anchored[1]) ?? 0) : 0;
      return { item, seq, atSec: base + within };
    });

    // Stable within a tie: two instructions on the same phrase keep the order
    // the block emitted them in.
    items.sort((a, z) => a.atSec - z.atSec || a.seq - z.seq);

    for (const { item, atSec } of items) {
      out.push({ ...item, atSec, timecode: formatDuration(atSec) });
    }
  });

  return out;
}

/** «3 штуки · 1 знято» — the header line above the list. */
export function editSummary(items: ReadonlyArray<TimedEditItem>, doneKeys: ReadonlySet<string>): string {
  const done = items.filter((i) => doneKeys.has(`${i.blockId}:${i.slot}`)).length;
  const parts = [`${items.length} штуки`];
  if (done > 0) parts.push(`${done} знято`);
  return parts.join(' · ');
}
