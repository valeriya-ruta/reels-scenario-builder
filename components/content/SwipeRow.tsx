'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Trash2, CalendarDays } from 'lucide-react';

const DATE_W = 76; // 📅 schedule action width
const DELETE_W = 76; // 🗑 delete action width
const OPEN_THRESHOLD = 24; // px pull to snap open (low → not sticky)

function vibrate(ms: number) {
  try {
    (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(ms);
  } catch {
    /* no-op */
  }
}

/**
 * Shared swipe row — the single source of truth for the list gesture so the
 * per-type list pages (Рілси/Каруселі) and the all-content rows (Home recents +
 * «Твій контент») behave identically.
 *
 * Behaviour (task 86d3d23nj): swiping the row LEFT reveals action buttons pinned
 * to the RIGHT edge — a neutral 📅 DATE action (schedule, opens a native date
 * picker) and a red 🗑 DELETE action. Delete arms «Точно?» on the first tap
 * (pointerup, so the post-swipe ghost-click can't eat it) and a second tap
 * confirms; red stays reserved for the destructive action only.
 *
 * Presentational + controlled: the parent owns open/armed/undo state and passes
 * the row's inner content as `children`. Scheduling is opt-in via `onSchedule`;
 * without it the row shows delete only.
 */
export default function SwipeRow({
  open,
  armed,
  onRequestOpen,
  onRequestClose,
  onArm,
  onDelete,
  onTap,
  onSchedule,
  scheduledDate,
  children,
}: {
  open: boolean;
  armed: boolean;
  onRequestOpen: () => void;
  onRequestClose: () => void;
  onArm: () => void;
  onDelete: () => void;
  /** Tap (no drag) on a closed row — open the item. */
  onTap: () => void;
  /** Schedule action handler; when omitted the 📅 action is hidden. */
  onSchedule?: (date: string | null) => void;
  scheduledDate?: string | null;
  children: ReactNode;
}) {
  const actionsW = onSchedule ? DATE_W + DELETE_W : DELETE_W;
  const [dragX, setDragX] = useState(0); // live finger offset while dragging
  const [removing, setRemoving] = useState(false);
  const start = useRef<{ x: number; base: number; moved: boolean; offset: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Negative offset = row slid LEFT to expose the actions pinned to the RIGHT.
  const restX = armed ? -9999 : open ? -actionsW : 0;
  const x = dragging ? dragX : restX;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (armed || removing) return;
    const base = open ? -actionsW : 0;
    start.current = { x: e.clientX, base, moved: false, offset: base };
    setDragX(base);
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 6) s.moved = true;
    // Clamp to [-actionsW, 0]: only a LEFT drag exposes the actions; a right drag
    // is pinned closed.
    const next = Math.max(-actionsW, Math.min(0, s.base + dx));
    s.offset = next;
    setDragX(next);
  };
  const endDrag = () => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s) return;
    if (!s.moved) {
      // Tap (no real drag): closed → open the item; open → close the row.
      if (open) onRequestClose();
      else onTap();
      return;
    }
    if (Math.abs(s.offset) >= OPEN_THRESHOLD) {
      if (!open) vibrate(10);
      onRequestOpen();
    } else {
      onRequestClose();
    }
  };

  // First tap arms (shows «Точно?»), second tap confirms the delete.
  const act = () => {
    if (armed) {
      setRemoving(true);
      window.setTimeout(onDelete, 300);
    } else {
      onArm();
    }
  };

  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.click();
  };

  return (
    <li
      className="relative overflow-hidden transition-[max-height,opacity] duration-300 ease-in"
      style={{ maxHeight: removing ? 0 : 240, opacity: removing ? 0 : 1 }}
    >
      {/* Action layer pinned to the RIGHT, revealed as the row slides left. Stops
          1px short of the bottom so it never bleeds through the hairline divider. */}
      <div
        className="absolute right-0 top-0 bottom-px flex items-stretch"
        style={{ width: armed ? '100%' : actionsW }}
      >
        {!armed && onSchedule && (
          <button
            type="button"
            aria-label="Запланувати"
            onPointerUp={(e) => {
              e.stopPropagation();
              openDatePicker();
            }}
            className="flex items-center justify-center bg-zinc-200 text-zinc-700"
            style={{ width: DATE_W, touchAction: 'manipulation' }}
          >
            <CalendarDays className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          aria-label={armed ? 'Підтвердити видалення' : 'Видалити'}
          // Arm/confirm on pointerup, not onClick: after the reveal swipe the
          // browser suppresses the first synthetic click (ghost-click).
          onPointerUp={(e) => {
            e.stopPropagation();
            act();
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            act();
          }}
          className="flex flex-1 items-center justify-center bg-red-600 text-white"
          style={{ width: armed ? '100%' : DELETE_W, touchAction: 'manipulation' }}
        >
          {armed ? <span className="text-[16px] font-bold">Точно?</span> : <Trash2 className="h-5 w-5" />}
        </button>
      </div>

      {/* Hidden native date input the 📅 action drives. */}
      {onSchedule && (
        <input
          ref={dateInputRef}
          type="date"
          value={scheduledDate ?? ''}
          onChange={(e) => {
            onSchedule(e.target.value || null);
            onRequestClose();
          }}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          tabIndex={-1}
          aria-hidden
        />
      )}

      {/* Foreground row — slides left to reveal the action layer. */}
      <div
        role="button"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onTap();
          }
        }}
        className="relative flex touch-pan-y items-center gap-3 bg-[color:var(--background)] px-2 py-3"
        style={{
          transform: `translateX(${armed ? -9999 : x}px)`,
          transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {children}
      </div>
      {/* hairline divider, inset */}
      <div className="ml-[52px] mr-5 h-px bg-[color:var(--border)]" />
    </li>
  );
}
