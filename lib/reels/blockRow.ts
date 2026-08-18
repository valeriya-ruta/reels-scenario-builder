/**
 * Block → database row, in one place.
 *
 * `toReelBlock` in ./blocks reads rows; this writes them. They are a pair, and
 * the pair is the reason this file exists rather than each caller spelling out
 * `{ screen_text: ..., record_note: ... }` at the point of use. A hand-copied
 * column list is what silently emptied a reel on screen once already: the
 * writer knew about a field the reader never asked for.
 *
 * Every key of the model appears here exactly once, and TypeScript requires it
 * to — `Record<keyof ReelBlock, ...>` means adding a field to the model and
 * forgetting it here does not compile.
 */

import type { ReelBlock } from './blocks';

/** What a block field is called in the database. */
const COLUMN: Record<keyof ReelBlock, string | null> = {
  // Identity and ownership are set at insert, never patched.
  id: null,
  projectId: null,
  orderIndex: 'order_index',
  kind: 'kind',
  speaker: 'speaker',
  spoken: 'spoken',
  screenText: 'screen_text',
  recordNote: 'record_note',
  assetKind: 'asset_kind',
  assetNote: 'asset_note',
  assetUrl: 'asset_url',
  editNote: 'edit_note',
  overlays: 'overlays',
  clips: 'clips',
  images: 'images',
  audioSource: 'audio_source',
  durationSec: 'duration_sec',
};

/** The fields a client is allowed to change. */
export type BlockPatch = Partial<Omit<ReelBlock, 'id' | 'projectId'>>;

/**
 * Translate a patch into a row update.
 *
 * Only keys actually present are emitted, so patching the text cannot blank an
 * overlay list the caller never mentioned — the difference between "set this to
 * null" and "leave this alone", which a full-object write loses.
 */
export function toBlockRow(patch: BlockPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = COLUMN[key as keyof ReelBlock];
    if (!column) continue;
    row[column] = value;
  }
  return row;
}

/** Column names a patch may legitimately touch — used to reject anything else. */
export const WRITABLE_BLOCK_COLUMNS: readonly string[] = Object.values(COLUMN).filter(
  (c): c is string => c !== null,
);
