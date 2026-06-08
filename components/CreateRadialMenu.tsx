'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Video, LayoutGrid, Circle, Lightbulb, type LucideIcon } from 'lucide-react';

/**
 * Create radial menu — fans 4 option bubbles out in an UPWARD arc (≈10–2 o'clock)
 * around the Create FAB so nothing sits under the thumb. All options share the
 * same blue treatment (no per-option color differentiation).
 *
 * Interaction is owned by the parent (BottomNav): this component is presentational.
 * It renders the dimming backdrop + bubbles given the anchor point and the
 * currently glide-highlighted index, and reports taps / backdrop dismiss back up.
 * The tap-to-open → tap-option path is the guaranteed core; long-press glide is a
 * layered enhancement driven by `highlightedId` + pointer hit-testing in the parent.
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
const RADIUS = 108;
/** Even fan across the upper arc: 150° (≈10 o'clock) → 30° (≈2 o'clock). */
const ANGLES_DEG = [150, 110, 70, 30];

export interface BubblePos {
  id: RadialOptionId;
  x: number;
  y: number;
}

/** Computes the on-screen center of each bubble for a given FAB anchor point. */
export function bubblePositions(anchor: { x: number; y: number }): BubblePos[] {
  return RADIAL_OPTIONS.map((opt, i) => {
    const theta = (ANGLES_DEG[i] * Math.PI) / 180;
    return {
      id: opt.id,
      x: anchor.x + RADIUS * Math.cos(theta),
      y: anchor.y - RADIUS * Math.sin(theta),
    };
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
  const firstBubbleRef = useRef<HTMLButtonElement>(null);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!open || !anchor) return null;

  return (
    <div
      data-testid="radial-menu"
      role="menu"
      aria-label="Створити"
      className="fixed inset-0 z-[60] md:hidden"
    >
      {/* Dimming backdrop — tap to dismiss. */}
      <button
        type="button"
        aria-label="Закрити"
        data-testid="radial-backdrop"
        onClick={onDismiss}
        className="absolute inset-0 h-full w-full bg-black/40 backdrop-blur-[1px]"
      />

      {positions.map((pos, i) => {
        const opt = RADIAL_OPTIONS[i];
        const highlighted = highlightedId === opt.id;
        const { Icon } = opt;
        return (
          <button
            key={opt.id}
            ref={(el) => {
              registerBubble(opt.id, el);
              if (i === 0) firstBubbleRef.current = el;
            }}
            type="button"
            role="menuitem"
            data-testid={`radial-option-${opt.id}`}
            data-option={opt.id}
            data-highlighted={highlighted ? 'true' : 'false'}
            onClick={() => onSelect(opt.id)}
            aria-label={opt.label}
            className="absolute flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{
              left: pos.x,
              top: pos.y,
              animation: `radial-bubble-in 180ms ease-out ${i * 35}ms both`,
            }}
          >
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_6px_16px_rgba(0,75,168,0.4)] transition-transform"
              style={{
                backgroundColor: ACCENT,
                transform: highlighted ? 'scale(1.12)' : 'scale(1)',
                boxShadow: highlighted
                  ? '0 0 0 4px rgba(255,255,255,0.85), 0 8px 20px rgba(0,75,168,0.5)'
                  : '0 6px 16px rgba(0,75,168,0.4)',
              }}
            >
              <Icon className="h-6 w-6" strokeWidth={2} />
            </span>
            <span className="rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-800 shadow-sm">
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
