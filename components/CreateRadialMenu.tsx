'use client';

import { useEffect, useMemo, useState } from 'react';
import { Video, LayoutGrid, Circle, Lightbulb, type LucideIcon } from 'lucide-react';
import BlurScrim from '@/components/BlurScrim';

/**
 * Create radial menu — fans 4 option bubbles into a thumb-friendly arc anchored
 * on the Create FAB. The arc is a BALANCED half-fan centred on 12 o'clock (up):
 * items spread symmetrically to the LEFT and RIGHT of straight-up rather than a
 * hard quarter-circle pinned to the right corner, so the cluster sits toward
 * screen-centre and is easy to read. Each option's text label sits ABOVE its
 * button so the thumb (arriving from the FAB below) never covers it.
 * All options share the same blue treatment (no per-option colour).
 * Tasks 86d39dnam (animation/glide) + 86d3a1a33 (centre/labels-above/both-sides).
 *
 * Interaction is owned by the parent (BottomNav): this component is presentational.
 * It renders the dimming blur backdrop + bubbles for the FAB anchor and the
 * currently glide-highlighted id, and reports taps / backdrop dismiss back up.
 * Tap-to-open → tap-option is the guaranteed core; long-press glide is layered on
 * via `highlightedId` + pointer hit-testing in the parent. The backdrop uses the
 * shared <BlurScrim> (portaled to body) so the blur is uniform over the whole
 * screen including the nav.
 */

export type RadialOptionId = 'reels' | 'carousel' | 'stories' | 'ideas';

export interface RadialOption {
  id: RadialOptionId;
  label: string;
  Icon: LucideIcon;
}

export const RADIAL_OPTIONS: RadialOption[] = [
  { id: 'reels', label: 'Рілс', Icon: Video },
  { id: 'carousel', label: 'Карусель', Icon: LayoutGrid },
  { id: 'stories', label: 'Сторіс', Icon: Circle },
  { id: 'ideas', label: 'Ідеї', Icon: Lightbulb },
];

const ACCENT = '#004BA8';
const RADIUS = 150;
/** Balanced half-fan symmetric about 12 o'clock (90° = straight up): the four
 *  items spread to the LEFT and RIGHT of centre instead of leaning into the
 *  right corner. Read left → right: Рілс → Карусель → Сторіс → Ідеї. */
const ANGLES_DEG = [145, 108, 72, 35];
/** Horizontal half-width of a bubble button (w-16 = 64px) — used to centre the
 *  icon on its computed arc point. */
const BUBBLE_HALF_W = 32;
/** Distance from a button's top edge down to its ICON centre (label block +
 *  gap + half the 56px icon), so labels-above don't push the icon off the arc. */
const ICON_CENTER_OFFSET = 54;
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
  return RADIAL_OPTIONS.map((opt, i) => {
    const theta = (ANGLES_DEG[i] * Math.PI) / 180;
    const x = anchor.x + RADIUS * Math.cos(theta);
    const y = anchor.y - RADIUS * Math.sin(theta);
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
}

export default function CreateRadialMenu({
  open,
  anchor,
  highlightedId,
  onSelect,
  onDismiss,
  registerBubble,
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
      blurPx={10}
      tint="rgba(10,12,20,0.45)"
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
              className="pointer-events-auto absolute flex w-16 flex-col items-center gap-1"
              style={{
                left: pos.x,
                top: pos.y,
                // Centre the ICON on the computed arc point: pull left by half the
                // button width and up by the label-block + half-icon offset so the
                // label sits above without shoving the icon off the arc.
                marginLeft: -BUBBLE_HALF_W,
                marginTop: -ICON_CENTER_OFFSET,
                ['--from-x' as string]: `${pos.fromX}px`,
                ['--from-y' as string]: `${pos.fromY}px`,
                animation: closing
                  ? `radial-bubble-collapse ${CLOSE_MS}ms ease-in ${(positions.length - 1 - i) * 30}ms both`
                  : `radial-bubble-pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 45}ms both`,
              }}
            >
              {/* Label ABOVE the icon — the thumb arrives from the FAB below, so a
                  label under the button would be covered by the finger. */}
              <span className="rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-800 shadow-sm">
                {opt.label}
              </span>
              <span
                className="flex h-14 w-14 items-center justify-center rounded-full text-white"
                style={{
                  backgroundColor: ACCENT,
                  // Glide target grows (scale-up feedback) — not a colour change.
                  transform: highlighted ? 'scale(1.32)' : 'scale(1)',
                  transition: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                  boxShadow: highlighted
                    ? '0 12px 28px rgba(0,75,168,0.55)'
                    : '0 6px 16px rgba(0,75,168,0.4)',
                }}
              >
                <Icon className="h-6 w-6" strokeWidth={2} />
              </span>
            </button>
          );
        })}
      </div>
    </BlurScrim>
  );
}
