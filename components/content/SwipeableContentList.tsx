'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Film, LayoutGrid, Play, CalendarDays, Plus } from 'lucide-react';
import { dayHeaderLabel } from '@/lib/content/calendar';
import DateSheet from '@/components/content/DateSheet';
import SetChip from '@/components/content/SetChip';
import StatusRing from '@/components/content/StatusRing';
import SwipeRow from '@/components/content/SwipeRow';
import ProposingEmptyState from '@/components/propose/ProposingEmptyState';
import { setContentStatus, setContentScheduledDate } from '@/app/content-actions';
import { contentHref, opensBraindumpOverlay, type ContentPiece } from '@/lib/content/contentPiece';
import { dispatchOpenBraindumpIdea } from '@/lib/content/braindumpIdeaEvent';
import { STATUS_COLORS, STATUS_LABELS, nextStatus, type ContentStatus } from '@/lib/content/statusSystem';
import { formatShortDate } from '@/lib/content/relativeTime';

/**
 * Sleek hairline list for a single content type (carousel / reels / …), matching
 * the home "Твій контент" language: status-ring rows + swipe-to-delete with a
 * two-tap "Точно?" arm and a 4s undo toast (task 86d3cq8f2 / 86d3cq9yf).
 *
 * The swipe gesture itself lives in the shared <SwipeRow> so it stays identical
 * to the all-content rows. `onCreate` and `onDelete` are server actions passed
 * by the page.
 */
const UNDO_MS = 4000;

function vibrate(ms: number) {
  try {
    (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(ms);
  } catch {
    /* no-op */
  }
}

// Icons are picked here by a serializable key — a server page can't pass a
// component (function) prop to this client component.
const HEADER_ICONS = { carousel: LayoutGrid, reel: Play, story: Film } as const;
export type ListIconKey = keyof typeof HEADER_ICONS;

export default function SwipeableContentList({
  pieces,
  heading,
  iconKey,
  accent,
  accentTint,
  onCreate,
  onDelete,
  emptyText,
}: {
  pieces: ContentPiece[];
  heading: string;
  iconKey: ListIconKey;
  accent: string;
  accentTint: string;
  onCreate: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  emptyText: string;
}) {
  const HeaderIcon = HEADER_ICONS[iconKey];
  const router = useRouter();
  const [items, setItems] = useState<ContentPiece[]>(pieces);
  // Optimistic status overrides for ring-tap-advance (task 86d3czf78).
  const [statusById, setStatusById] = useState<Record<string, ContentStatus>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [undo, setUndo] = useState<{ piece: ContentPiece; index: number } | null>(null);
  // Piece whose date sheet is open (app's own picker, never the OS one).
  const [dateFor, setDateFor] = useState<ContentPiece | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setItems(pieces), [pieces]);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const closeAll = useCallback(() => {
    setOpenId(null);
    setArmedId(null);
  }, []);

  // Commit the in-flight delete to the DB and clear the undo entry.
  const commitDelete = useCallback(
    (piece: ContentPiece) => {
      setUndo((cur) => (cur && cur.piece.id === piece.id ? null : cur));
      void onDelete(piece.id);
    },
    [onDelete],
  );

  const removeRow = useCallback(
    (piece: ContentPiece) => {
      vibrate(14);
      const index = items.findIndex((p) => p.id === piece.id);
      setItems((cur) => cur.filter((p) => p.id !== piece.id));
      setOpenId(null);
      setArmedId(null);
      // Flush any prior pending delete immediately (only one undo at a time).
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndo((prev) => {
        if (prev) void onDelete(prev.piece.id);
        return { piece, index: index < 0 ? 0 : index };
      });
      undoTimer.current = setTimeout(() => commitDelete(piece), UNDO_MS);
    },
    [items, onDelete, commitDelete],
  );

  // Swipe 📅 DATE action → optimistically stamp/clear scheduled_date (task 86d3d23nj).
  const schedule = useCallback((piece: ContentPiece, date: string | null) => {
    const prev = piece.scheduledDate;
    setItems((list) => list.map((p) => (p.id === piece.id ? { ...p, scheduledDate: date } : p)));
    void setContentScheduledDate(piece.refTable, piece.id, date).then((res) => {
      if (!res.ok) {
        setItems((list) => list.map((p) => (p.id === piece.id ? { ...p, scheduledDate: prev } : p)));
      }
    });
  }, []);

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

  const create = () => {
    if (creating) return;
    setCreating(true);
    void onCreate().finally(() => setCreating(false));
  };

  // Ring-tap-advance — the only status control (task 86d3czf78). One tap moves
  // the piece exactly one stage along its track; optimistic with rollback.
  const advance = useCallback(
    (piece: ContentPiece) => {
      if (opensBraindumpOverlay(piece)) {
        dispatchOpenBraindumpIdea(piece.id, piece.text ?? piece.title);
        return;
      }
      const current = statusById[piece.id] ?? piece.status;
      const next = nextStatus(piece.type, current);
      if (!next) return; // already at the final stage → gentle no-op
      vibrate(8);
      setStatusById((m) => ({ ...m, [piece.id]: next }));
      void setContentStatus(piece.refTable, piece.id, piece.type, next).then((res) => {
        if (!res.ok) setStatusById((m) => ({ ...m, [piece.id]: current })); // roll back
      });
    },
    [statusById],
  );

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-0.5 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
            style={{ backgroundColor: accentTint }}
          >
            <HeaderIcon size={21} style={{ color: accent }} />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="app-title truncate">{heading}</h1>
            <p className="app-subtitle">{items.length} матеріалів</p>
          </div>
        </div>
        <button
          type="button"
          onClick={create}
          disabled={creating}
          aria-label="Створити"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-[var(--elev-1)] transition active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: accent }}
        >
          {creating ? '…' : <Plus className="h-5 w-5" strokeWidth={2.4} />}
        </button>
      </div>
      <div className="h-px bg-[color:var(--border)]" />

      {items.length === 0 ? (
        // Never a dead end: an empty type list proposes concrete angles the user
        // can start from, drawn from their own signals.
        <div className="pt-3">
          <ProposingEmptyState headline={emptyText} />
        </div>
      ) : (
        <ul className="app-card overflow-hidden px-1.5 py-0.5">
          {items.map((piece) => {
            const status = statusById[piece.id] ?? piece.status;
            return (
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
                onTap={() => {
                  closeAll();
                  if (opensBraindumpOverlay(piece)) {
                    dispatchOpenBraindumpIdea(piece.id, piece.text ?? piece.title);
                    return;
                  }
                  router.push(contentHref(piece));
                }}
              >
                {/* Ring is its own hit target — one tap advances status by a stage
                    and must NOT open the item; stopping pointer/click propagation
                    keeps the swipe + tap-to-open handlers from firing. */}
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
                  <StatusRing type={piece.type} status={status} size={34} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center text-[15.5px] font-semibold text-[color:var(--foreground)]">
                    <span className="truncate">{piece.title}</span>
                    <SetChip piece={piece} />
                  </div>
                  <div className="mt-0.5 text-[12.5px]">
                    <span className="font-medium" style={{ color: STATUS_COLORS[status] }}>
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="text-zinc-400"> · {formatShortDate(piece.updatedAt)}</span>
                  </div>
                </div>
                {piece.scheduledDate ? (
                  <span
                    className="mr-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-[color:var(--surface1)] px-2 py-0.5 text-[11px] font-medium text-zinc-500"
                    title="Заплановано"
                  >
                    <CalendarDays className="h-3 w-3" aria-hidden="true" />
                    {dayHeaderLabel(piece.scheduledDate)}
                  </span>
                ) : null}
                <ChevronRight size={18} className="shrink-0 text-[#c4c4ce]" />
              </SwipeRow>
            );
          })}
        </ul>
      )}

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
                className="shrink-0 text-sm font-semibold"
                style={{ color: accent }}
              >
                Скасувати
              </button>
            </div>
            <div className="h-[3px] bg-white/15">
              <div className="h-full" style={{ backgroundColor: accent, animation: `undo-drain ${UNDO_MS}ms linear forwards` }} />
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
    </div>
  );
}
