'use client';

import { useEffect, useMemo, useState } from 'react';
import { Play, LayoutGrid, Circle, Lightbulb, type LucideIcon } from 'lucide-react';
import BlurScrim from '@/components/BlurScrim';

/**
 * Create radial menu — a Pinterest-style TIGHT arc cluster that fans out to the
 * RIGHT of the centered Create FAB (task 86d3ca3jy, geometry signed off in the
 * mockup). Small bubbles, each type's chip colour, label ABOVE the bubble.
 *
 * Arc math (LOCKED):
 *   anchor = FAB centre (cx, cy)
 *   radius R = min(viewportWidth * 0.32, 128)px
 *   spread 104°, centre 64° → angles 116°…12° (CCW from +x), evenly over 4 items
 *   x = cx + R·cos(deg); y = cy − R·sin(deg)
 *
 * Interaction is owned by the parent (BottomNav): this component is presentational.
 * It reports taps / backdrop dismiss back up and reflects the glide-armed bubble
 * via `highlightedId`. The backdrop reuses the shared <BlurScrim> (the same
 * component the braindump / export overlays use) — no parallel scrim.
 */

export type RadialOptionId = 'reels' | 'carousel' | 'stories' | 'ideas';

export interface RadialOption {
  id: RadialOptionId;
  label: string;
  Icon: LucideIcon;
  color: string;
}

/** Order along the arc, index 0→3 (upper-left → right): Карусель, Рілс, Сторіс, Ідея.
 *  Bubble colours = each type's chip colour. */
export const RADIAL_OPTIONS: RadialOption[] = [
  { id: 'carousel', label: 'Карусель', Icon: LayoutGrid, color: '#185FA5' },
  { id: 'reels', label: 'Рілс', Icon: Play, color: '#534AB7' },
  { id: 'stories', label: 'Сторіс', Icon: Circle, color: '#D85A30' },
  { id: 'ideas', label: 'Ідея', Icon: Lightbulb, color: '#5F5E5A' },
];

/** Tight, right-biased arc: spread 104°, centre 64°, evenly across 4 items. */
const ARC_CENTER_DEG = 64;
const ARC_SPREAD_DEG = 104;
const ANGLES_DEG = RADIAL_OPTIONS.map((_, i) =>
  ARC_CENTER_DEG + ARC_SPREAD_DEG / 2 - (i * ARC_SPREAD_DEG) / (RADIAL_OPTIONS.length - 1),
);

/** Radius scales with the viewport, capped at 128px (LOCKED). */
function arcRadius(): number {
  const vw = typeof window === 'undefined' ? 390 : window.innerWidth;
  return Math.min(vw * 0.32, 128);
}

/** Bubble = 46px circle; the column is wider so the label can sit centred above. */
const BUBBLE_PX = 46;
const COLUMN_W = 72;
const COLUMN_HALF_W = COLUMN_W / 2;
/** Top edge of the column → bubble centre = label(≈16) + gap(4) + half bubble. */
const ICON_CENTER_OFFSET = 16 + 4 + BUBBLE_PX / 2;
/** ms the close/collapse animation runs before the menu unmounts. */
const CLOSE_MS = 200;

export interface BubblePos {
  id: RadialOptionId;
  x: number;
  y: number;
  /** Vector back to the FAB centre (for the spring-from-FAB origin). */
  fromX: number;
  fromY: number;
}

/** Computes the on-screen center of each bubble for a given FAB anchor point. */
export function bubblePositions(anchor: { x: number; y: number }): BubblePos[] {
  const R = arcRadius();
  return RADIAL_OPTIONS.map((opt, i) => {
    const theta = (ANGLES_DEG[i] * Math.PI) / 180;
    const x = anchor.x + R * Math.cos(theta);
    const y = anchor.y - R * Math.sin(theta);
    return { id: opt.id, x, y, fromX: anchor.x - x, fromY: anchor.y - y };
  });
}

interface CreateRadialMenuProps {
  open: boolean;
  anchor: { x: number; y: number } | null;
  highlightedId: RadialOptionId | null;
  onSelect: (id: RadialOptionId) => void;
  onDismiss: () => void;
  /** Registers each bubble's DOM node so the parent can hit-test glide gestures. */
  registerBubble: (id: RadialOptionId, el: HTMLButtonElement | null) => void;
  /** Phase-2 hook: when true, labels are hidden once the user is familiar. v1
   *  always shows them — the hiding logic is intentionally NOT implemented here. */
  hideLabels?: boolean;
}

export default function CreateRadialMenu({
  open,
  anchor,
  highlightedId,
  onSelect,
  onDismiss,
  registerBubble,
  hideLabels = false,
}: CreateRadialMenuProps) {
  const positions = useMemo(() => (anchor ? bubblePositions(anchor) : []), [anchor]);

  // Keep mounted briefly while closing so the bubbles can collapse back into the
  // FAB instead of snapping away.
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setRender(true);
      setClosing(false);
      return;
    }
    if (!render) return;
    setClosing(true);
    const t = setTimeout(() => {
      setRender(false);
      setClosing(false);
    }, CLOSE_MS);
    return () => clearTimeout(t);
  }, [open, render]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!render || !anchor) return null;

  return (
    <BlurScrim
      zIndex={60}
      blurPx={12}
      tint="rgba(20,20,30,0.55)"
      className="md:hidden"
      style={{ transition: `opacity ${CLOSE_MS}ms ease`, opacity: closing ? 0 : 1 }}
      data-testid="radial-backdrop"
      onScrimClick={onDismiss}
    >
      <div
        data-testid="radial-menu"
        role="menu"
        aria-label="Створити"
        className="pointer-events-none absolute inset-0"
      >
        {positions.map((pos, i) => {
          const opt = RADIAL_OPTIONS[i];
          const highlighted = highlightedId === opt.id;
          const { Icon } = opt;
          return (
            <button
              key={opt.id}
              ref={(el) => registerBubble(opt.id, el)}
              type="button"
              role="menuitem"
              data-testid={`radial-option-${opt.id}`}
              data-option={opt.id}
              data-highlighted={highlighted ? 'true' : 'false'}
              onClick={() => onSelect(opt.id)}
              aria-label={opt.label}
              className="pointer-events-auto absolute flex flex-col items-center gap-1"
              style={{
                left: pos.x,
                top: pos.y,
                width: COLUMN_W,
                // Centre the BUBBLE on the computed arc point: pull left by half the
                // column and up by the label-block + half-bubble so the label sits
                // above without shoving the bubble off the arc.
                marginLeft: -COLUMN_HALF_W,
                marginTop: -ICON_CENTER_OFFSET,
                ['--from-x' as string]: `${pos.fromX}px`,
                ['--from-y' as string]: `${pos.fromY}px`,
                animation: closing
                  ? `radial-bubble-collapse ${CLOSE_MS}ms ease-in ${(positions.length - 1 - i) * 35}ms both`
                  : `radial-bubble-pop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 50}ms both`,
              }}
            >
              {/* Label ABOVE the bubble — white with a shadow for legibility (the
                  thumb arrives from the FAB below, so a label under would be
                  covered). v1 always shows it; `hideLabels` is the phase-2 hook. */}
              {hideLabels ? null : (
                <span
                  className="select-none text-[11px] font-semibold leading-none text-white"
                  style={{ textShadow: '0 1px 3px rgba(0,0,0,0.55)' }}
                >
                  {opt.label}
                </span>
              )}
              <span
                className="flex items-center justify-center rounded-full text-white"
                style={{
                  width: BUBBLE_PX,
                  height: BUBBLE_PX,
                  backgroundColor: opt.color,
                  // Glide-armed bubble: white ring + slight scale-up.
                  transform: highlighted ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                  boxShadow: highlighted
                    ? '0 0 0 3px rgba(255,255,255,0.95), 0 4px 13px rgba(0,0,0,0.22)'
                    : '0 4px 13px rgba(0,0,0,0.22)',
                }}
              >
                <Icon style={{ width: 21, height: 21 }} strokeWidth={2} />
              </span>
            </button>
          );
        })}
      </div>
    </BlurScrim>
  );
}
