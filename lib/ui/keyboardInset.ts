'use client';

import { useEffect, useState } from 'react';

/**
 * How many pixels the on-screen keyboard covers at the bottom of the page.
 *
 * `position: fixed; bottom: 0` does NOT sit above the keyboard on a phone. The
 * default behaviour on Android Chrome and iOS Safari is to shrink only the
 * VISUAL viewport, leaving the layout viewport — and therefore everything
 * pinned to its bottom — underneath the keys. That is why the selection bar and
 * the toolbar were invisible in exactly the state this screen is designed for:
 * text selected, keyboard up.
 *
 * `visualViewport` is the one measurement that gets this right on both, so the
 * bar is offset by this instead of trusting `bottom: 0`. The alternative,
 * `interactive-widget=resizes-content` in the viewport meta, is a document-wide
 * change that would move every other screen's fixed furniture too.
 *
 * Returns 0 with no keyboard, on desktop, and during server rendering.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const measure = () => {
      // What the layout viewport has that the visual one does not: the keyboard,
      // plus any amount the page is scrolled within it.
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // Small negative values show up from rounding and from the URL bar; a
      // threshold keeps the bar from twitching when nothing is really there.
      setInset(covered > 24 ? Math.round(covered) : 0);
    };

    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
    };
  }, []);

  return inset;
}
