'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ContentRow, { type ContentRowPiece } from '@/components/content/ContentRow';
import StatusPickerSheet from '@/components/content/StatusPickerSheet';
import { setContentStatus } from '@/app/content-actions';
import { contentHref, type ContentPiece } from '@/lib/content/contentPiece';
import { nextStatus, type ContentStatus } from '@/lib/content/statusSystem';

/**
 * Interactive list of content rows (Status system 4/8 — task 86d3btmh7).
 * Shared by the Home recents and the full list page.
 *
 * - Tap the ring → advance ONE stage along the type's track (repeat to skip);
 *   stops at Опубліковано; an idea-type piece can't advance (it must be promoted
 *   to a real type first — graceful no-op + hint for now).
 * - Long-press a row → status picker (all 7, invalid greyed).
 * - Tap a row → open the piece's editor.
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
  const [picker, setPicker] = useState<ContentPiece | null>(null);

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

  const handleRingClick = useCallback(
    (row: ContentRowPiece) => {
      const piece = pieces.find((p) => p.id === row.id);
      if (!piece) return;
      if (piece.type === 'idea') {
        onHint?.('Зроби з цього контент');
        return;
      }
      const next = nextStatus(piece.type, piece.status);
      if (!next) return; // already at Опубліковано → gentle no-op
      void persist(piece, next, piece.status);
    },
    [pieces, persist, onHint],
  );

  const handleOpen = useCallback(
    (row: ContentRowPiece) => {
      const piece = pieces.find((p) => p.id === row.id);
      if (piece) router.push(contentHref(piece));
    },
    [pieces, router],
  );

  const handleLongPress = useCallback(
    (row: ContentRowPiece) => {
      const piece = pieces.find((p) => p.id === row.id);
      if (piece) setPicker(piece);
    },
    [pieces],
  );

  return (
    <>
      {pieces.map((piece) => (
        <ContentRow
          key={piece.id}
          piece={piece}
          onOpen={handleOpen}
          onRingClick={handleRingClick}
          onLongPress={handleLongPress}
        />
      ))}

      {picker ? (
        <StatusPickerSheet
          type={picker.type}
          current={picker.status}
          title={picker.title}
          onSelect={(status) => {
            const piece = pieces.find((p) => p.id === picker.id);
            if (piece && status !== piece.status) void persist(piece, status, piece.status);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </>
  );
}
