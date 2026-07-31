'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Trash2, CalendarDays } from 'lucide-react';

const DATE_W = 76; // 📅 schedule action width
const DELETE_W = 76; // 🗑 delete action width
const OPEN_THRESHOLD = 24; // px pull to snap open (low → not sticky)
/** Travel past which a gesture is a scroll/swipe rather than a tap. */
const SLOP = 8;

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
 * to the RIGHT edge — a neutral 📅 DATE action (asks the parent to open the app's own
 * date sheet) and a red 🗑 DELETE action. Delete arms «Точно?» on the first tap
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
  variant = 'row',
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
  /** Asks the parent to open the app's own date sheet; omit to hide the 📅 action. */
  onSchedule?: () => void;
  /**
   * 'card' — an editorial content card: rounded, elevated, no hairline divider,
   * taller. 'row' keeps the original compact hairline list. The GESTURE is
   * identical in both, so the swipe behaviour stays defined in exactly one place.
   */
  variant?: 'row' | 'card';
  children: ReactNode;
}) {
  const isCard = variant === 'card';
  const actionsW = onSchedule ? DATE_W + DELETE_W : DELETE_W;
  const [dragX, setDragX] = useState(0); // live finger offset while dragging
  const [removing, setRemoving] = useState(false);
  // `axis` locks the gesture the first time it travels past the slop: 'x' is a
  // swipe, 'y' is the page scrolling and the row must stay out of the way.
  const start = useRef<{
    x: number;
    y: number;
    base: number;
    moved: boolean;
    axis: 'x' | 'y' | null;
    offset: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Negative offset = row slid LEFT to expose the actions pinned to the RIGHT.
  const restX = armed ? -9999 : open ? -actionsW : 0;
  const x = dragging ? dragX : restX;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (armed || removing) return;
    const base = open ? -actionsW : 0;
    start.current = { x: e.clientX, y: e.clientY, base, moved: false, axis: null, offset: base };
    setDragX(base);
    setDragging(true);
    // Deliberately NOT capturing the pointer: capture would fight the browser's
    // native vertical pan, and the axis lock below already keeps the swipe from
    // stealing a scroll.
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;

    // Decide once, at the first meaningful movement, whether this gesture is a
    // horizontal swipe or the page scrolling. Previously only `dx` was measured,
    // so a vertical scroll that started on a row left `moved` false and fired
    // onTap on release — scrolling opened items (§0).
    if (!s.axis && (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP)) {
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      s.moved = true;
    }
    if (s.axis !== 'x') {
      // Vertical: let the page scroll, keep the row still.
      if (s.axis === 'y' && dragX !== s.base) setDragX(s.base);
      return;
    }

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
    // A gesture that travelled is never a tap, whichever way it went.
    if (!s.moved && s.axis === null) {
      // Tap (no real travel): closed → open the item; open → close the row.
      if (open) onRequestClose();
      else onTap();
      return;
    }
    if (s.axis !== 'x') {
      // It was a scroll — leave the row exactly as it was.
      return;
    }
    if (Math.abs(s.offset) >= OPEN_THRESHOLD) {
      if (!open) vibrate(10);
      onRequestOpen();
    } else {
      onRequestClose();
    }
  };

  /**
   * The browser fires pointercancel when it takes the gesture over to scroll the
   * page. That is unambiguously a scroll, so it must reset WITHOUT running the
   * tap branch — routing cancel into endDrag is what made a flick-scroll open
   * whatever it started on.
   */
  const cancelDrag = () => {
    start.current = null;
    setDragging(false);
    setDragX(open ? -actionsW : 0);
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

  return (
    <li
      className={`relative overflow-hidden transition-[max-height,opacity] duration-300 ease-in ${
        isCard ? 'rounded-[16px]' : ''
      }`}
      style={{
        maxHeight: removing ? 0 : 260,
        opacity: removing ? 0 : 1,
        marginBottom: isCard && !removing ? 10 : 0,
        boxShadow: isCard ? 'var(--elev-1)' : undefined,
        border: isCard ? '1px solid var(--border)' : undefined,
      }}
    >
      {/* Action layer pinned to the RIGHT, revealed as the row slides left. Stops
          1px short of the bottom so it never bleeds through the hairline divider. */}
      <div
        className={`absolute right-0 top-0 flex items-stretch ${isCard ? 'bottom-0' : 'bottom-px'}`}
        style={{ width: armed ? '100%' : actionsW }}
      >
        {!armed && onSchedule && (
          <button
            type="button"
            aria-label="Запланувати"
            onPointerUp={(e) => {
              e.stopPropagation();
              onSchedule();
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


      {/* Foreground row — slides left to reveal the action layer. */}
      <div
        role="button"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onTap();
          }
        }}
        className={`relative flex touch-pan-y gap-3 bg-[color:var(--background)] ${
          isCard ? 'items-start px-3.5 py-3.5' : 'items-center px-2 py-3'
        }`}
        style={{
          transform: `translateX(${armed ? -9999 : x}px)`,
          transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {children}
      </div>
      {/* hairline divider, inset — cards separate by their own gap instead. */}
      {isCard ? null : <div className="ml-[52px] mr-5 h-px bg-[color:var(--border)]" />}
    </li>
  );
}
