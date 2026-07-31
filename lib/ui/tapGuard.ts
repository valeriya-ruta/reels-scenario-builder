'use client';

import { useCallback, useRef } from 'react';
import { TAP_SLOP_PX, suppressClick } from '@/lib/ui/gesture';

export { TAP_SLOP_PX };

/**
 * Scroll-vs-tap discrimination (§0).
 *
 * A plain `onClick` on an element inside a scroller fires whenever the finger
 * lifts, even if the whole gesture was a scroll that merely started on top of
 * that element. On a phone that means grazing a list while scrolling opens
 * things — the single most-reported annoyance in Round 1, worst in the carousel
 * slide strip where every thumbnail is a button inside a horizontal scroller.
 *
 * The rule this encodes: a tap is a press that did NOT travel. Anything that
 * travelled past the slop is a scroll, and a scroll must never activate
 * anything.
 *
 * Keyboard activation is preserved: a click with no preceding pointerdown (Enter
 * / Space on a focused button) has no movement to judge, so it is always allowed
 * through.
 */

export type TapGuardProps = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
  onClick: (e: React.MouseEvent) => void;
};

export function useTapGuard(
  onTap: (e: React.MouseEvent) => void,
  slop: number = TAP_SLOP_PX,
): TapGuardProps {
  // `maxTravel` latches the furthest the pointer got, so a gesture that wanders
  // out of the slop circle and drifts back still counts as a scroll.
  const start = useRef<{ x: number; y: number; maxTravel: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, maxTravel: 0 };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    s.maxTravel = Math.max(s.maxTravel, Math.hypot(e.clientX - s.x, e.clientY - s.y));
  }, []);

  // The browser fires pointercancel when it takes the gesture over for native
  // scrolling. That is definitively a scroll, never a tap.
  const onPointerCancel = useCallback(() => {
    start.current = { x: 0, y: 0, maxTravel: Number.POSITIVE_INFINITY };
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const s = start.current;
      start.current = null;
      // No pointerdown at all → keyboard activation, always allowed.
      if (suppressClick(s ? s.maxTravel : null, slop)) return;
      onTap(e);
    },
    [onTap, slop],
  );

  return { onPointerDown, onPointerMove, onPointerCancel, onClick };
}
