'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Film, LayoutGrid, Play } from 'lucide-react';
import StatusRing from '@/components/content/StatusRing';
import SwipeRow from '@/components/content/SwipeRow';
import { setContentStatus } from '@/app/content-actions';
import { contentHref, type ContentPiece } from '@/lib/content/contentPiece';
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
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px]"
            style={{ backgroundColor: accentTint }}
          >
            <HeaderIcon size={20} style={{ color: accent }} />
          </span>
          <div className="leading-tight">
            <h1 className="text-[21px] font-bold text-[color:var(--foreground)]">{heading}</h1>
            <p className="text-[12.5px] text-[#9a9aa6]">{items.length} матеріалів</p>
          </div>
        </div>
        <button
          type="button"
          onClick={create}
          disabled={creating}
          className="rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition active:scale-95 disabled:opacity-50"
          style={{ borderColor: accent, color: accent }}
        >
          {creating ? '…' : '+ Створити'}
        </button>
      </div>
      <div className="h-px bg-[color:var(--border)]" />

      {items.length === 0 ? (
        <p className="px-2 py-14 text-center text-sm leading-relaxed text-zinc-500">{emptyText}</p>
      ) : (
        <ul>
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
                onTap={() => {
                  closeAll();
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
                  <div className="truncate text-[15.5px] font-semibold text-[color:var(--foreground)]">
                    {piece.title}
                  </div>
                  <div className="mt-0.5 text-[12.5px]">
                    <span className="font-medium" style={{ color: STATUS_COLORS[status] }}>
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="text-zinc-400"> · {formatShortDate(piece.updatedAt)}</span>
                  </div>
                </div>
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
    </div>
  );
}
