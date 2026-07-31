import { test, expect } from '@playwright/test';
import {
  classifyGesture,
  shouldActivate,
  suppressClick,
  TAP_SLOP_PX,
  AXIS_SLOP_PX,
} from '@/lib/ui/gesture';

/**
 * §0's one rule: a scroll never activates anything.
 *
 * The Round 1 bug had two halves, both pinned here. SwipeRow measured only
 * horizontal travel, so a vertical scroll left the gesture looking like a
 * motionless tap; and pointercancel (the browser announcing it has taken the
 * gesture over to scroll) was routed into the same handler as a finger lift.
 */

test.describe('gesture classification', () => {
  test('a press that barely moves is a tap', () => {
    expect(classifyGesture(0, 0)).toBe('tap');
    expect(classifyGesture(3, -4)).toBe('tap');
    expect(classifyGesture(AXIS_SLOP_PX, AXIS_SLOP_PX)).toBe('tap');
  });

  test('vertical travel is a scroll, NOT a tap — the Round 1 bug', () => {
    // The exact shape that used to open items: no horizontal movement at all,
    // so the old `Math.abs(dx) > 6` check never tripped.
    expect(classifyGesture(0, 60)).toBe('scroll-y');
    expect(classifyGesture(0, -60)).toBe('scroll-y');
    expect(shouldActivate(0, 60)).toBe(false);
  });

  test('horizontal travel is a swipe, not a tap', () => {
    expect(classifyGesture(40, 2)).toBe('swipe-x');
    expect(shouldActivate(40, 2)).toBe(false);
  });

  test('a diagonal graze resolves to its dominant axis', () => {
    expect(classifyGesture(30, 12)).toBe('swipe-x');
    expect(classifyGesture(12, 30)).toBe('scroll-y');
  });

  test('pointercancel is a scroll however small the measured travel', () => {
    // At cancel time the finger has often barely moved — which is precisely why
    // treating cancel like a finger lift made flick-scrolls open things.
    expect(classifyGesture(0, 0, true)).toBe('scroll-y');
    expect(shouldActivate(0, 0, true)).toBe(false);
  });
});

test.describe('click suppression', () => {
  test('swallows a click that travelled past the slop', () => {
    expect(suppressClick(TAP_SLOP_PX + 1)).toBe(true);
    expect(suppressClick(200)).toBe(true);
  });

  test('lets a stationary press through', () => {
    expect(suppressClick(0)).toBe(false);
    expect(suppressClick(TAP_SLOP_PX)).toBe(false);
  });

  test('keyboard activation is never suppressed', () => {
    // No pointerdown → nothing to measure → must always activate, or Enter on a
    // focused card would silently do nothing.
    expect(suppressClick(null)).toBe(false);
  });

  test('tap slop is looser than axis slop, so a swipe is decided before a tap is refused', () => {
    expect(TAP_SLOP_PX).toBeGreaterThanOrEqual(AXIS_SLOP_PX);
  });
});
