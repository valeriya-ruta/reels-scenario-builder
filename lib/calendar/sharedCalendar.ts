/**
 * The shared (client-facing) calendar — shapes + normalization, pure.
 *
 * A share link opens a READ-ONLY copy of План for someone with no account: the
 * month grid, what is planned on a day, and the detail of one piece. The
 * database hands that back as loosely-typed rows and one jsonb document per
 * piece (see migration 029); everything here turns that into the exact shape the
 * page renders, so the view has no parsing in it and the parsing has no DOM in
 * it (it is unit-tested on its own).
 *
 * Deliberately import-free of React/server code — the public page, the API route
 * and the specs all use this same module.
 */

import type { ContentType } from '@/lib/content/statusSystem';
import {
  AUDIO_SOURCES,
  toRefImages,
  toReelBlock,
  type AudioSource,
  type ReelBlock,
  type RefImage,
} from '@/lib/reels/blocks';

/**
 * The types a shared calendar can carry. Ideas are excluded by construction, not
 * by a filter: an idea has no date it is committed to, and the client's calendar
 * shows the plan, not the maybes.
 */
export type SharedContentType = Exclude<ContentType, 'idea'>;

/** The owner's share link, as the settings UI sees it. */
export type CalendarShareLink = {
  id: string;
  token: string;
  title: string | null;
  note: string | null;
  revoked: boolean;
  createdAt: string;
};

/**
 * One dated piece as it appears on the shared month grid + day list.
 *
 * No `status`. «Ідея» / «Зняти» / «Змонтувати» is the creator's production
 * state, not the client's business — and dropping it HERE rather than in the
 * view means it never reaches the browser at all, instead of being rendered
 * invisibly into the page's data and readable from view-source. The database
 * function still returns it; this is the boundary where the client's copy of a
 * piece is defined.
 */
export type SharedPiece = {
  id: string;
  type: SharedContentType;
  title: string;
  refTable: 'carousel_projects' | 'projects' | 'storytelling_projects';
  /** 'YYYY-MM-DD'. Never null — the shared calendar only carries dated pieces. */
  scheduledDate: string;
  setIndex: number | null;
  setSize: number | null;
};

/** One unit of a piece's body: a story card, a reel scene, a carousel slide. */
export type SharedBlock = {
  /** «Сторіс 2» / «Слайд 3» / a scene's own name. */
  heading: string;
  /** What is actually said/written there. Empty when the block is still blank. */
  body: string;
  /** Production detail, already labelled («Візуал: Гарне фото»). */
  meta: string[];
};

/**
 * A reel, whole, exactly as the builder and the reel share link hold it.
 *
 * Not a summary. The calendar used to paraphrase a reel into headings and meta
 * lines, which was written before a cutaway could hold clips — so the reels
 * that are pure video, the ones a client most needs explained, arrived as
 * «Відео / нарізка · Ще не написано». Carrying the real blocks means the
 * calendar renders the SAME page the reel link does, and cannot fall behind it
 * again.
 */
export type SharedReelDetail = {
  blocks: ReelBlock[];
  /** «Про що цей рілс» — the brief. */
  overview: string | null;
  /** The reel's own sound, which each block falls back to. */
  audio: AudioSource | null;
  references: RefImage[];
};

export type SharedPieceDetail = {
  id: string;
  type: SharedContentType;
  title: string;
  scheduledDate: string | null;
  /** Story cards and carousel slides. Empty for a reel — see `reel`. */
  blocks: SharedBlock[];
  /** Present only for reels. */
  reel?: SharedReelDetail;
  /** «5 сторіс» / «8 слайдів» / «6 сцен» — the count, in the format's own noun. */
  countLabel: string;
};

const REF_TABLES = new Set(['carousel_projects', 'projects', 'storytelling_projects']);

/** Whether a string is a ref_table the share link is allowed to open. */
export function isShareableRefTable(value: unknown): value is SharedPiece['refTable'] {
  return typeof value === 'string' && REF_TABLES.has(value);
}

const KIND_TO_TYPE: Record<string, SharedContentType> = {
  story: 'story',
  reel: 'reel',
  carousel: 'carousel',
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === 'object') as Record<string, unknown>[]) : [];
}

/** Slavic plural pick, so a count never reads «3 слайд». */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function countLabelFor(type: SharedContentType, n: number): string {
  if (type === 'carousel') return `${n} ${plural(n, 'слайд', 'слайди', 'слайдів')}`;
  if (type === 'reel') return `${n} ${plural(n, 'сцена', 'сцени', 'сцен')}`;
  return `${n} сторіс`;
}

/**
 * The reel half of the payload (migration 048).
 *
 * The block objects carry the table's own column names, so they go through
 * `toReelBlock` — the single parser the builder, the reel share and the card
 * previews already use. Adding a field to the reel model can therefore never
 * leave this reader behind, which is exactly how `clips` went missing here.
 */
function toSharedReel(doc: Record<string, unknown>): SharedReelDetail {
  const audio = text(doc.reelAudio) as AudioSource;
  return {
    blocks: asArray(doc.blocks).map((b) => toReelBlock(b)),
    overview: text(doc.overview) || null,
    audio: AUDIO_SOURCES.includes(audio) ? audio : null,
    references: toRefImages(doc.references),
  };
}

/** Rows from `calendar_share_pieces` → the calendar's own shape. */
export function toSharedPieces(rows: ReadonlyArray<Record<string, unknown>>): SharedPiece[] {
  const out: SharedPiece[] = [];
  for (const row of rows) {
    const date = text(row.scheduled_date).slice(0, 10);
    const refTable = row.ref_table;
    if (!date || !isShareableRefTable(refTable)) continue;
    out.push({
      id: String(row.id),
      type: KIND_TO_TYPE[text(row.content_type)] ?? 'reel',
      title: text(row.title),
      refTable,
      scheduledDate: date,
      setIndex: typeof row.set_index === 'number' ? row.set_index : null,
      setSize: typeof row.set_size === 'number' ? row.set_size : null,
    });
  }
  // Stable order inside a day: a set reads 1, 2, 3, then everything else.
  return out.sort((a, b) => {
    if (a.scheduledDate !== b.scheduledDate) return a.scheduledDate < b.scheduledDate ? -1 : 1;
    const ia = a.setIndex ?? Number.MAX_SAFE_INTEGER;
    const ib = b.setIndex ?? Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return a.title.localeCompare(b.title, 'uk');
  });
}

/**
 * The jsonb document from `calendar_share_piece` → the detail view's blocks.
 *
 * Every branch produces the SAME shape (heading / body / meta), so the detail
 * view renders one list and never branches on the content type — the difference
 * between a reel and a carousel is what the labels say, not how the page works.
 */
export function toSharedDetail(payload: unknown): SharedPieceDetail | null {
  if (!payload || typeof payload !== 'object') return null;
  const doc = payload as Record<string, unknown>;
  const type = KIND_TO_TYPE[text(doc.kind)];
  if (!type) return null;

  const raw = asArray(doc.blocks);

  // A reel is not flattened into headings and meta lines: it is handed over
  // whole and rendered by the same component the reel share link uses.
  const reel = type === 'reel' ? toSharedReel(doc) : undefined;

  const blocks: SharedBlock[] = reel
    ? []
    : type === 'story'
      ? raw.map((b, i) => ({
          heading: `Сторіс ${i + 1}`,
          body: text(b.text),
          meta: [
            text(b.visual) ? `Візуал: ${text(b.visual)}` : '',
            text(b.engagement) ? `Інтерактив: ${text(b.engagement)}` : '',
          ].filter(Boolean),
        }))
      : raw.map((b, i) => ({
          heading: text(b.title) || `Слайд ${i + 1}`,
          body: text(b.body),
          meta: [],
        }));

  return {
    id: String(doc.id ?? ''),
    type,
    title: text(doc.title),
    scheduledDate: text(doc.scheduledDate).slice(0, 10) || null,
    blocks,
    ...(reel ? { reel } : {}),
    countLabel: countLabelFor(type, reel ? reel.blocks.length : blocks.length),
  };
}
