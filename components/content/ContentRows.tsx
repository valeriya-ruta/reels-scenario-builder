'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ContentRow, { type ContentRowPiece } from '@/components/content/ContentRow';
import { setContentStatus } from '@/app/content-actions';
import { contentHref, type ContentPiece } from '@/lib/content/contentPiece';
import { OPEN_BRAINDUMP_IDEA_EVENT } from '@/lib/content/braindumpIdeaEvent';
import { nextStatus, type ContentStatus } from '@/lib/content/statusSystem';

/**
 * Interactive list of content rows (Status system 4/8 — task 86d3btmh7).
 * Shared by the Home recents and the full list page.
 *
 * Status interactions (task 86d3c7mpf, final):
 * - Tap the ring → advance ONE stage along the type's track (repeat to skip);
 *   stops at Опубліковано; an idea-type piece can't advance (it must be promoted
 *   to a real type first — graceful no-op + hint).
 * - Tap a row → open the piece's editor.
 *
 * There is no long-press and no status picker — ring-tap-advance is the only
 * status control by design.
 *
 * Status changes are optimistic and persisted via the setContentStatus action;
 * on failure we roll back and surface a hint.
 */
export default function ContentRows({
  pieces: initialPieces,
  onHint,
}: {
  pieces: ContentPiece[];
  /** Optional toast/hint sink (e.g. idea-type ring tap, save failure). */
  onHint?: (message: string) => void;
}) {
  const router = useRouter();
  const [statusById, setStatusById] = useState<Record<string, ContentStatus>>({});

  const pieces = useMemo(
    () => initialPieces.map((p) => ({ ...p, status: statusById[p.id] ?? p.status })),
    [initialPieces, statusById],
  );

  const persist = useCallback(
    async (piece: ContentPiece, next: ContentStatus, prev: ContentStatus) => {
      setStatusById((m) => ({ ...m, [piece.id]: next }));
      const res = await setContentStatus(piece.refTable, piece.id, piece.type, next);
      if (!res.ok) {
        setStatusById((m) => ({ ...m, [piece.id]: prev })); // roll back
        onHint?.('Не вдалося оновити статус');
      }
    },
    [onHint],
  );

  // Reopen the braindump overlay pre-loaded with the idea's text. The full text
  // is carried on the piece (getAllContent attaches it), so this fires
  // synchronously — the overlay rises instantly, no server round-trip lag
  // (task 86d3czeyc).
  const openIdea = useCallback((piece: ContentPiece) => {
    window.dispatchEvent(
      new CustomEvent(OPEN_BRAINDUMP_IDEA_EVENT, {
        detail: { id: piece.id, text: piece.text ?? piece.title },
      }),
    );
  }, []);

  const handleRingClick = useCallback(
    (row: ContentRowPiece) => {
      const piece = pieces.find((p) => p.id === row.id);
      if (!piece) return;
      // An idea has no status to advance, so its ring defaults to the row's open
      // action (open the braindump overlay) — task 86d3czeyc.
      if (piece.type === 'idea') {
        openIdea(piece);
        return;
      }
      const next = nextStatus(piece.type, piece.status);
      if (!next) return; // already at Опубліковано → gentle no-op
      void persist(piece, next, piece.status);
    },
    [pieces, persist, openIdea],
  );

  const handleOpen = useCallback(
    (row: ContentRowPiece) => {
      const piece = pieces.find((p) => p.id === row.id);
      if (!piece) return;
      // An idea row reopens the braindump overlay pre-loaded with its text — it
      // must NOT open a content editor (task 86d3cpv9x / 86d3c7u88 bug 3).
      if (piece.type === 'idea') {
        openIdea(piece);
        return;
      }
      router.push(contentHref(piece));
    },
    [pieces, router, openIdea],
  );

  return (
    <>
      {pieces.map((piece) => (
        <ContentRow
          key={piece.id}
          piece={piece}
          onOpen={handleOpen}
          onRingClick={handleRingClick}
        />
      ))}
    </>
  );
}
