/**
 * The script, exactly as she wrote it — the thing «Скопіювати весь текст» puts
 * on the clipboard.
 *
 * This is a copy-fidelity function before it is anything else. It goes straight
 * into Instagram Edits or any other teleprompter app, so a single stray marker,
 * scene number or speaker prefix is read out loud on camera. The rule is
 * therefore absolute: NOTHING is added, and the only thing removed is
 * whitespace at the very ends.
 *
 * `spokenScript` in ./blocks is the wrong tool for this and must not be
 * substituted: it prefixes dialogue with «Ім'я: », which is metadata. So is
 * `toTeleprompterBeats` in lib/content/teleprompter, which collapses runs of
 * whitespace and so destroys exactly the paragraph breaks she typed.
 *
 * Captions are deliberately NOT included. Words on screen are not words in the
 * mouth, and pasting them into a teleprompter is how they get read aloud —
 * they are carried by the editing list instead. A reel with nothing spoken
 * therefore has no script, and the screen says so rather than offering an
 * empty copy button.
 */

import type { ReelBlock } from './blocks';

/** Blocks contributing spoken words, in reel order. */
function spokenBlocks(blocks: ReadonlyArray<ReelBlock>): string[] {
  return blocks
    .map((b) => (b.spoken ?? '').trim())
    .filter((line) => line.length > 0);
}

/**
 * The whole script as one string.
 *
 * Blocks are separated by a blank line — the same gap a paragraph break makes —
 * so a yap (one block holding the entire text) comes back byte-for-byte as it
 * was typed, and a scene-split reel reads as continuous prose rather than as a
 * list. Line breaks INSIDE a block are never touched.
 */
export function cleanScript(blocks: ReadonlyArray<ReelBlock>): string {
  return spokenBlocks(blocks).join('\n\n');
}

/** Is there anything to copy? Drives the empty state on «Чистий текст». */
export function hasScript(blocks: ReadonlyArray<ReelBlock>): boolean {
  return spokenBlocks(blocks).length > 0;
}

/** Words in the script — what the duration estimate counts. */
export function scriptWordCount(blocks: ReadonlyArray<ReelBlock>): number {
  return countWords(cleanScript(blocks));
}

/** One definition of "a word", so every count in the app agrees. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
