/**
 * Pure gesture classification shared by every tappable surface (§0).
 *
 * Kept import-free so the rule "a scroll never activates anything" can be
 * unit-tested directly, rather than only being observable by scrolling a phone.
 */

/** Travel past which a gesture stops being a tap. */
export const TAP_SLOP_PX = 10;
/** Travel past which a row gesture commits to an axis. */
export const AXIS_SLOP_PX = 8;

export type Gesture = 'tap' | 'swipe-x' | 'scroll-y';

/**
 * Classify a completed pointer gesture from its total travel.
 *
 * `cancelled` is the browser telling us it took the gesture over to scroll the
 * page — definitively not a tap, whatever the measured travel says (the travel
 * at cancel time is often still tiny, which is exactly how flick-scrolls used to
 * register as taps).
 */
export function classifyGesture(
  dx: number,
  dy: number,
  cancelled = false,
  slop: number = AXIS_SLOP_PX,
): Gesture {
  if (cancelled) return 'scroll-y';
  if (Math.abs(dx) <= slop && Math.abs(dy) <= slop) return 'tap';
  return Math.abs(dx) > Math.abs(dy) ? 'swipe-x' : 'scroll-y';
}

/** Whether a completed gesture should activate the thing under the finger. */
export function shouldActivate(dx: number, dy: number, cancelled = false): boolean {
  return classifyGesture(dx, dy, cancelled) === 'tap';
}

/**
 * Whether a click should be swallowed, given how far the pointer travelled
 * since pointerdown. `travelled === null` means there was no pointerdown at all
 * (keyboard activation), which must always be allowed through.
 */
export function suppressClick(travelledPx: number | null, slop: number = TAP_SLOP_PX): boolean {
  if (travelledPx === null) return false;
  return travelledPx > slop;
}
