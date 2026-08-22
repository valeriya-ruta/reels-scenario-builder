import { BLOCK_KINDS, type BlockKind } from '@/lib/reels/blocks';
import { ENGAGEMENT_OPTIONS, VISUAL_OPTIONS, type EngagementType, type VisualType } from '@/lib/domain';

/**
 * A piece of План as something you can TYPE INTO — the shape, and what changed.
 *
 * `PieceDetail` renders a piece to be read; this is the same piece as a draft
 * held in a form. It is pure — no React, no Supabase — because the interesting
 * part is not the textareas, it is working out which rows to insert, update,
 * delete and reorder when Save is pressed. That is testable on its own, and it
 * has to be right: a diff that gets this wrong silently loses writing.
 *
 * Only story and reel live here. A carousel is a designed object — colours,
 * placement, photos — and editing it in a side panel would be pretending; it
 * opens its own editor instead.
 */

export type EditableStory = {
  id: string;
  text: string;
  visual: VisualType | null;
  engagement: EngagementType | null;
};

export type EditableBlock = {
  id: string;
  kind: BlockKind;
  speaker: string;
  spoken: string;
  screenText: string;
  recordNote: string;
  assetNote: string;
  editNote: string;
  /**
   * How many shots a cutaway holds. Not editable here — the panel says so and
   * points at the full editor — but it has to be KNOWN, or a block that is
   * really eight clips would render as an empty box.
   */
  clipCount: number;
};

export type EditableDoc =
  | { kind: 'story'; id: string; name: string; columnId: string | null; stories: EditableStory[] }
  | { kind: 'reel'; id: string; name: string; overview: string; blocks: EditableBlock[] };

/** What Save has to do to the database, worked out from the draft. */
export type RowEdits<T> = {
  created: (T & { orderIndex: number })[];
  updated: T[];
  deleted: string[];
  /** Final id order, when the order changed and has to be written back. */
  order: string[] | null;
};

// ── normalizing what the database hands back ────────────────────────────────

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(text(value)) ? (value as T) : null;
}

export function toEditableStory(row: Record<string, unknown>): EditableStory {
  return {
    id: String(row.id ?? ''),
    text: text(row.text),
    visual: oneOf(row.visual, VISUAL_OPTIONS),
    engagement: oneOf(row.engagement, ENGAGEMENT_OPTIONS),
  };
}

export function toEditableBlock(row: Record<string, unknown>): EditableBlock {
  const kind = oneOf(row.kind, BLOCK_KINDS) ?? 'talk';
  return {
    id: String(row.id ?? ''),
    kind,
    speaker: text(row.speaker),
    spoken: text(row.spoken),
    screenText: text(row.screen_text ?? row.screenText),
    recordNote: text(row.record_note ?? row.recordNote),
    assetNote: text(row.asset_note ?? row.assetNote),
    editNote: text(row.edit_note ?? row.editNote),
    clipCount: Array.isArray(row.clips) ? row.clips.length : 0,
  };
}

// ── blanks ──────────────────────────────────────────────────────────────────

export function emptyStory(id: string): EditableStory {
  return { id, text: '', visual: null, engagement: null };
}

export function emptyBlock(id: string, kind: BlockKind = 'talk'): EditableBlock {
  return {
    id,
    kind,
    speaker: '',
    spoken: '',
    screenText: '',
    recordNote: '',
    assetNote: '',
    editNote: '',
    clipCount: 0,
  };
}

// ── the diff ────────────────────────────────────────────────────────────────

function sameStory(a: EditableStory, b: EditableStory): boolean {
  return a.text === b.text && a.visual === b.visual && a.engagement === b.engagement;
}

function sameBlock(a: EditableBlock, b: EditableBlock): boolean {
  return (
    a.kind === b.kind &&
    a.speaker === b.speaker &&
    a.spoken === b.spoken &&
    a.screenText === b.screenText &&
    a.recordNote === b.recordNote &&
    a.assetNote === b.assetNote &&
    a.editNote === b.editNote
  );
}

/**
 * What changed between what was loaded and what is on screen.
 *
 * Deliberately id-based rather than index-based: a row that was only MOVED must
 * come out as a reorder, not as a delete plus an insert, because deleting it
 * would take its shot-progress and its share-link ticks with it.
 */
function diff<T extends { id: string }>(
  original: readonly T[],
  draft: readonly T[],
  same: (a: T, b: T) => boolean,
): RowEdits<T> {
  const before = new Map(original.map((row) => [row.id, row]));
  const draftIds = new Set(draft.map((row) => row.id));

  const created: (T & { orderIndex: number })[] = [];
  const updated: T[] = [];

  draft.forEach((row, index) => {
    const previous = before.get(row.id);
    if (!previous) created.push({ ...row, orderIndex: index });
    else if (!same(previous, row)) updated.push(row);
  });

  const deleted = original.filter((row) => !draftIds.has(row.id)).map((row) => row.id);

  // Order is rewritten whenever the surviving rows do not read in their old
  // order, or whenever something was inserted or removed — both shift the
  // indices of everything after them.
  const survivors = original.filter((row) => draftIds.has(row.id)).map((row) => row.id);
  const draftSurvivors = draft.filter((row) => before.has(row.id)).map((row) => row.id);
  const moved = survivors.some((id, i) => draftSurvivors[i] !== id);
  const orderChanged = moved || created.length > 0 || deleted.length > 0;

  return { created, updated, deleted, order: orderChanged ? draft.map((row) => row.id) : null };
}

export function diffStories(
  original: readonly EditableStory[],
  draft: readonly EditableStory[],
): RowEdits<EditableStory> {
  return diff(original, draft, sameStory);
}

export function diffBlocks(
  original: readonly EditableBlock[],
  draft: readonly EditableBlock[],
): RowEdits<EditableBlock> {
  return diff(original, draft, sameBlock);
}

/** Whether a diff would touch the database at all. */
export function hasChanges<T>(edits: RowEdits<T>): boolean {
  return (
    edits.created.length > 0 ||
    edits.updated.length > 0 ||
    edits.deleted.length > 0 ||
    edits.order !== null
  );
}

/**
 * Whether the draft differs from what was loaded — the question the Save button
 * and the "you have unsaved changes" guard both ask.
 */
export function docIsDirty(original: EditableDoc, draft: EditableDoc): boolean {
  if (original.kind !== draft.kind) return true;
  if (original.name !== draft.name) return true;

  if (original.kind === 'story' && draft.kind === 'story') {
    return hasChanges(diffStories(original.stories, draft.stories));
  }
  if (original.kind === 'reel' && draft.kind === 'reel') {
    return original.overview !== draft.overview || hasChanges(diffBlocks(original.blocks, draft.blocks));
  }
  return false;
}
