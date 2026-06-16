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
  /** Underlying table the piece lives in (for opening the right editor). */
  refTable: 'carousel_projects' | 'projects' | 'storytelling_projects' | 'ideas';
  createdAt: string;
  updatedAt: string;
};

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
      return `/?idea=${piece.id}`;
    default:
      return '/';
  }
}
