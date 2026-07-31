'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import SwipeRow from '@/components/content/SwipeRow';
import ContentCard from '@/components/content/ContentCard';
import { deleteContentPiece, setContentScheduledDate } from '@/app/content-actions';
import { contentHref, opensBraindumpOverlay, type ContentPiece } from '@/lib/content/contentPiece';
import { OPEN_BRAINDUMP_IDEA_EVENT } from '@/lib/content/braindumpIdeaEvent';
import {
  useAdvanceContentStatus,
  useLiveStatuses,
} from '@/lib/content/contentStatusStore';
import DateSheet from '@/components/content/DateSheet';

/**
 * Interactive list of content rows (Status system 4/8). Shared by the Home
 * recents and the full «Твій контент» list.
 *
 * Each piece renders as an editorial <ContentCard> — the content previewing what
 * it will become, not a title-and-status row. The swipe gesture itself still
 * lives in the shared <SwipeRow>, so behaviour is identical to every other list.
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

export default function ContentRows({
  pieces: initialPieces,
  onHint,
}: {
  pieces: ContentPiece[];
  /** Optional toast/hint sink (e.g. status save failure). */
  onHint?: (message: string) => void;
}) {
  const router = useRouter();
  const advanceStatus = useAdvanceContentStatus();
  const [items, setItems] = useState<ContentPiece[]>(initialPieces);
  const [openId, setOpenId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ piece: ContentPiece; index: number } | null>(null);
  // Piece whose date sheet is open (app's own picker, never the OS one).
  const [dateFor, setDateFor] = useState<ContentPiece | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setItems(initialPieces), [initialPieces]);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  // Status comes from the ONE app-wide store, never from a copy owned by this
  // list — Home mounts this component three times over overlapping data, and
  // per-instance copies are exactly how the same object used to render two
  // different statuses on one screen (Prompt 9).
  const pieces = useLiveStatuses(items);

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

  const advance = useCallback(
    (piece: ContentPiece) => {
      if (opensBraindumpOverlay(piece)) {
        openIdea(piece);
        return;
      }
      // The store owns the optimistic update, the write, the rollback, the
      // «got a link?» prompt and the revalidation — one path for every surface.
      void advanceStatus(piece).then((outcome) => {
        if (outcome === 'failed') onHint?.('Не вдалося оновити статус');
      });
    },
    [advanceStatus, openIdea, onHint],
  );

  const open = useCallback(
    (piece: ContentPiece) => {
      if (opensBraindumpOverlay(piece)) {
        openIdea(piece);
        return;
      }
      router.push(contentHref(piece));
    },
    [router, openIdea],
  );

  // Swipe 📅 DATE action → optimistically stamp/clear scheduled_date (task 86d3d23nj).
  const schedule = useCallback(
    (piece: ContentPiece, date: string | null) => {
      const prev = piece.scheduledDate;
      setItems((list) => list.map((p) => (p.id === piece.id ? { ...p, scheduledDate: date } : p)));
      void setContentScheduledDate(piece.refTable, piece.id, date).then((res) => {
        if (!res.ok) {
          setItems((list) => list.map((p) => (p.id === piece.id ? { ...p, scheduledDate: prev } : p)));
          onHint?.('Не вдалося запланувати');
        }
      });
    },
    [onHint],
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
            onSchedule={() => setDateFor(piece)}
            variant="card"
            onTap={() => {
              closeAll();
              open(piece);
            }}
          >
            <ContentCard piece={piece} onAdvance={() => advance(piece)} />
          </SwipeRow>
        ))}
      </ul>

      {undo ? (
        <div className="app-float-above-nav pointer-events-none z-[80] flex justify-center px-4">
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

      {/* App's own date picker — never the OS one (consistent with the editors). */}
      <DateSheet
        open={dateFor !== null}
        onClose={() => setDateFor(null)}
        value={dateFor?.scheduledDate ?? null}
        onPick={(date) => {
          if (dateFor) schedule(dateFor, date);
        }}
      />
    </>
  );
}
