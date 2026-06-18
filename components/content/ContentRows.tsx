'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import StatusRing from '@/components/content/StatusRing';
import SwipeRow from '@/components/content/SwipeRow';
import { setContentStatus, deleteContentPiece } from '@/app/content-actions';
import { contentHref, type ContentPiece } from '@/lib/content/contentPiece';
import { OPEN_BRAINDUMP_IDEA_EVENT } from '@/lib/content/braindumpIdeaEvent';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  TYPE_CHIP_COLORS,
  TYPE_LABELS,
  nextStatus,
  type ContentStatus,
} from '@/lib/content/statusSystem';
import { formatRelativeTime } from '@/lib/content/relativeTime';

/**
 * Interactive list of content rows (Status system 4/8). Shared by the Home
 * recents and the full «Твій контент» list.
 *
 * Interactions:
 * - Tap the ring → advance ONE stage (idea rows reopen the braindump overlay).
 * - Tap a row → open the piece (idea rows reopen the braindump overlay).
 * - Swipe a row RIGHT → trash on the LEFT, single-tap «Точно?», tap to delete,
 *   with a 4s undo toast. The gesture lives in the shared <SwipeRow> so it is
 *   identical to the per-type list pages (task 86d3d2fqy).
 *
 * Status changes + deletes are optimistic; on failure we roll back / surface a hint.
 */
const UNDO_MS = 4000;

function TypeChip({ type }: { type: ContentPiece['type'] }) {
  const color = TYPE_CHIP_COLORS[type];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ color, backgroundColor: `${color}1F` }}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}

export default function ContentRows({
  pieces: initialPieces,
  onHint,
}: {
  pieces: ContentPiece[];
  /** Optional toast/hint sink (e.g. status save failure). */
  onHint?: (message: string) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ContentPiece[]>(initialPieces);
  const [statusById, setStatusById] = useState<Record<string, ContentStatus>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ piece: ContentPiece; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setItems(initialPieces), [initialPieces]);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const pieces = useMemo(
    () => items.map((p) => ({ ...p, status: statusById[p.id] ?? p.status })),
    [items, statusById],
  );

  const closeAll = useCallback(() => {
    setOpenId(null);
    setArmedId(null);
  }, []);

  // Reopen the braindump overlay pre-loaded with the idea's text (carried on the
  // piece, so this is synchronous — no round-trip).
  const openIdea = useCallback((piece: ContentPiece) => {
    window.dispatchEvent(
      new CustomEvent(OPEN_BRAINDUMP_IDEA_EVENT, {
        detail: { id: piece.id, text: piece.text ?? piece.title },
      }),
    );
  }, []);

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

  const advance = useCallback(
    (piece: ContentPiece) => {
      if (piece.type === 'idea') {
        openIdea(piece);
        return;
      }
      const current = statusById[piece.id] ?? piece.status;
      const next = nextStatus(piece.type, current);
      if (!next) return; // already at Опубліковано → gentle no-op
      void persist(piece, next, current);
    },
    [statusById, persist, openIdea],
  );

  const open = useCallback(
    (piece: ContentPiece) => {
      if (piece.type === 'idea') {
        openIdea(piece);
        return;
      }
      router.push(contentHref(piece));
    },
    [router, openIdea],
  );

  // --- swipe-to-delete (optimistic + 4s undo) ---
  const commitDelete = useCallback((piece: ContentPiece) => {
    setUndo((cur) => (cur && cur.piece.id === piece.id ? null : cur));
    void deleteContentPiece(piece.refTable, piece.id);
  }, []);

  const removeRow = useCallback(
    (piece: ContentPiece) => {
      const index = items.findIndex((p) => p.id === piece.id);
      setItems((cur) => cur.filter((p) => p.id !== piece.id));
      setOpenId(null);
      setArmedId(null);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndo((prev) => {
        if (prev) void deleteContentPiece(prev.piece.refTable, prev.piece.id); // flush prior
        return { piece, index: index < 0 ? 0 : index };
      });
      undoTimer.current = setTimeout(() => commitDelete(piece), UNDO_MS);
    },
    [items, commitDelete],
  );

  const restore = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo((cur) => {
      if (!cur) return null;
      setItems((list) => {
        if (list.some((p) => p.id === cur.piece.id)) return list;
        const next = [...list];
        next.splice(Math.min(cur.index, next.length), 0, cur.piece);
        return next;
      });
      return null;
    });
  }, []);

  return (
    <>
      <ul>
        {pieces.map((piece) => (
          <SwipeRow
            key={piece.id}
            open={openId === piece.id}
            armed={armedId === piece.id}
            onRequestOpen={() => {
              setOpenId(piece.id);
              setArmedId(null);
            }}
            onRequestClose={() => {
              if (openId === piece.id) closeAll();
            }}
            onArm={() => setArmedId(piece.id)}
            onDelete={() => removeRow(piece)}
            onTap={() => {
              closeAll();
              open(piece);
            }}
          >
            {/* Ring is its own hit target — one tap advances status (idea rows
                reopen the braindump); stopPropagation keeps the swipe/tap from
                firing. */}
            <button
              type="button"
              aria-label="Змінити статус"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                advance(piece);
              }}
              className="shrink-0 rounded-full p-0.5 transition active:scale-95"
            >
              <StatusRing type={piece.type} status={piece.status} size={30} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-[color:var(--foreground)]">
                {piece.title || 'Без назви'}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-zinc-500">
                <span className="shrink-0 font-medium" style={{ color: STATUS_COLORS[piece.status] }}>
                  {STATUS_LABELS[piece.status]}
                </span>
                <span aria-hidden="true">·</span>
                <TypeChip type={piece.type} />
                <span aria-hidden="true">·</span>
                <span className="shrink-0 whitespace-nowrap">{formatRelativeTime(piece.updatedAt)}</span>
              </div>
            </div>
          </SwipeRow>
        ))}
      </ul>

      {undo ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl bg-zinc-900 text-white shadow-xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="truncate text-sm">
                Видалено «{undo.piece.title.length > 22 ? `${undo.piece.title.slice(0, 22)}…` : undo.piece.title}»
              </span>
              <button
                type="button"
                onClick={restore}
                className="shrink-0 text-sm font-semibold text-[color:var(--accent)]"
              >
                Скасувати
              </button>
            </div>
            <div className="h-[3px] bg-white/15">
              <div
                className="h-full bg-[color:var(--accent)]"
                style={{ animation: `undo-drain ${UNDO_MS}ms linear forwards` }}
              />
            </div>
          </div>
        </div>
      ) : null}
      <style>{`@keyframes undo-drain{from{width:100%}to{width:0%}}`}</style>
    </>
  );
}
