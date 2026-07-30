import type { ContentStatus, ContentType } from '@/lib/content/statusSystem';

/**
 * Client-safe content-piece shape + routing (no server-only deps), so client
 * components (rows, list, home) can import these without pulling the server read.
 */
export type ContentPiece = {
  id: string;
  userId: string;
  type: ContentType;
  status: ContentStatus;
  title: string;
  /** Full idea text, present only for idea pieces. Carried with the list so an
   *  idea row can reopen the braindump overlay instantly, without a round-trip
   *  (task 86d3czeyc — the list `title` is only the first 80 chars). */
  text?: string;
  /** Underlying table the piece lives in (for opening the right editor). */
  refTable: 'carousel_projects' | 'projects' | 'storytelling_projects' | 'ideas';
  /** Calendar placement (YYYY-MM-DD) or null if unscheduled (task 86d3d23nj). */
  scheduledDate: string | null;
  /** Position within a multi-day generation (1-based), when part of a set. */
  setIndex?: number | null;
  /** How many pieces were generated together, when part of a set. */
  setSize?: number | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * A row that lives in the `ideas` table always reopens the braindump overlay
 * (task 86d3c7u88 bug 3) — never a content editor. Routing keys off the table,
 * not `type`, so a promoted idea (still in `ideas`, content_type flipped to
 * reel/carousel/story) also reopens the braindump instead of falling through to
 * the old dead `/?idea=` route.
 */
export function opensBraindumpOverlay(piece: Pick<ContentPiece, 'type' | 'refTable'>): boolean {
  return piece.refTable === 'ideas' || piece.type === 'idea';
}

/** Route a content piece to its editor URL (used by the row's tap-to-open). */
export function contentHref(piece: Pick<ContentPiece, 'type' | 'refTable' | 'id'>): string {
  switch (piece.refTable) {
    case 'carousel_projects':
      return `/carousel/${piece.id}`;
    case 'projects':
      return `/project/${piece.id}`;
    case 'storytelling_projects':
      return `/storytelling/${piece.id}`;
    case 'ideas':
      // Ideas open the braindump overlay (see opensBraindumpOverlay), so this is
      // only a safety fallback — never the old dead `/?idea=` route.
      return '/dashboard';
    default:
      return '/';
  }
}
