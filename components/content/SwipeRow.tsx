'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

export const TRASH_W = 88; // leading red affordance width
const OPEN_THRESHOLD = 24; // px pull to snap open (low → not sticky)

function vibrate(ms: number) {
  try {
    (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(ms);
  } catch {
    /* no-op */
  }
}

/**
 * Shared swipe-to-delete row — the single source of truth for the gesture so the
 * per-type list pages (Рілси/Каруселі) and the all-content rows (Home recents +
 * «Твій контент») behave identically (tasks 86d3czf4h, 86d3d2fqy).
 *
 * Behaviour: trash sits on the LEFT edge, revealed by dragging the row to the
 * RIGHT (a left drag is pinned closed). The trash arms «Точно?» on the first tap
 * (pointerup, so the post-swipe ghost-click can't eat it) and a second tap
 * confirms. The red layer stops 1px short of the bottom so it never bleeds
 * through the inset hairline divider.
 *
 * Presentational + controlled: the parent owns open/armed/undo state and passes
 * the row's inner content as `children` (any nested control — e.g. the status
 * ring — should stopPropagation so it doesn't trigger the swipe/tap).
 */
export default function SwipeRow({
  open,
  armed,
  onRequestOpen,
  onRequestClose,
  onArm,
  onDelete,
  onTap,
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
  children: ReactNode;
}) {
  const [dragX, setDragX] = useState(0); // live finger offset while dragging
  const [removing, setRemoving] = useState(false);
  // `offset` tracks the live position in the ref too, so endDrag's snap decision
  // never reads a stale React state value on a fast flick.
  const start = useRef<{ x: number; base: number; moved: boolean; offset: number } | null>(null);
  // `dragging` mirrors start.current as state so render never reads the ref.
  const [dragging, setDragging] = useState(false);

  // Positive offset = row slid RIGHT to expose the trash pinned to the LEFT edge.
  const restX = armed ? 9999 : open ? TRASH_W : 0;
  const x = dragging ? dragX : restX;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (armed || removing) return;
    const base = open ? TRASH_W : 0;
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
    // Clamp to [0, TRASH_W]: only a RIGHT drag exposes the trash; a left drag is
    // pinned closed.
    const next = Math.min(TRASH_W, Math.max(0, s.base + dx));
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
    if (s.offset >= OPEN_THRESHOLD) {
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

  return (
    <li
      className="relative overflow-hidden transition-[max-height,opacity] duration-300 ease-in"
      style={{ maxHeight: removing ? 0 : 240, opacity: removing ? 0 : 1 }}
    >
      {/* Red destructive layer behind the row. Stops 1px short of the bottom so
          it never bleeds through the inset hairline divider (a thin red line). */}
      <button
        type="button"
        aria-label={armed ? 'Підтвердити видалення' : 'Видалити'}
        // Arm/confirm on pointerup, not onClick: after the reveal swipe the
        // browser suppresses the first synthetic click (ghost-click), which is
        // why arming used to need a second tap. touch-action:manipulation also
        // drops the mobile tap delay.
        onPointerUp={(e) => {
          e.stopPropagation();
          act();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          act();
        }}
        className="absolute left-0 top-0 bottom-px flex items-center justify-center bg-red-600 text-white"
        style={{ width: armed ? '100%' : TRASH_W, touchAction: 'manipulation' }}
      >
        {armed ? <span className="text-[16px] font-bold">Точно?</span> : <Trash2 className="h-5 w-5" />}
      </button>

      {/* Foreground row — slides to reveal the red layer. */}
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
          transform: `translateX(${armed ? 9999 : x}px)`,
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
