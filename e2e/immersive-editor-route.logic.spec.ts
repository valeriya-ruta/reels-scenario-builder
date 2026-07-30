import { test, expect } from '@playwright/test';
import { isImmersiveEditorRoute } from '../lib/immersiveEditorRoute';

/**
 * Regression lock for hiding the global bottom navbar on full-screen editors
 * (task 86d3d23qu). BottomNav returns null when isImmersiveEditorRoute(pathname)
 * is true, so this pins exactly which routes are immersive: the reel/script,
 * story, and carousel *editors* (with an id) — never their list routes, never
 * home/plan/analysis/profile.
 */

test.describe('isImmersiveEditorRoute — navbar hidden on editors only', () => {
  test('editor routes (with id) are immersive → navbar hidden', () => {
    expect(isImmersiveEditorRoute('/project/abc123')).toBe(true);
    expect(isImmersiveEditorRoute('/storytelling/abc123')).toBe(true);
    expect(isImmersiveEditorRoute('/carousel/abc123')).toBe(true);
  });

  test('list / index routes keep the navbar', () => {
    expect(isImmersiveEditorRoute('/projects')).toBe(false);
    expect(isImmersiveEditorRoute('/storytellings')).toBe(false);
    expect(isImmersiveEditorRoute('/carousel')).toBe(false);
  });

  test('primary destinations keep the navbar', () => {
    for (const p of ['/', '/dashboard', '/plan', '/competitor-analysis', '/profile', '/settings']) {
      expect(isImmersiveEditorRoute(p)).toBe(false);
    }
  });
});
