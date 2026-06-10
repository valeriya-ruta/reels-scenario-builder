'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Single, shared full-viewport blur scrim used by every blur-overlay (carousel
 * export + braindump). Task 86d39dwbd.
 *
 * Why a portal to <body>: `backdrop-filter` only blurs the whole page uniformly
 * when the blurring element has NO ancestor that establishes a containing block
 * (a `transform`, `filter`, `perspective`, `contain`, etc.). Overlays mounted
 * deep in the tree (e.g. the braindump opened from the transform-animated radial
 * menu, or the export overlay inside the editor) sat under such an ancestor, so
 * the blur either vanished or rendered as per-element halos. Rendering the scrim
 * — and the overlay content above it — as a direct child of <body> guarantees a
 * single even frosted sheet over the entire app, including the bottom nav. We do
 * NOT put backdrop-filter on any underlying UI element.
 */
export default function BlurScrim({
  children,
  onScrimClick,
  blurPx = 16,
  tint = 'rgba(255,255,255,0.5)',
  zIndex = 60,
  className = '',
  style,
  'data-testid': dataTestid = 'blur-scrim',
  ...rest
}: {
  children?: ReactNode;
  /** Tap-outside handler bound to the blur layer itself. */
  onScrimClick?: () => void;
  blurPx?: number;
  tint?: string;
  zIndex?: number;
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className={`fixed inset-0 ${className}`} style={{ zIndex, ...style }} {...rest}>
      <div
        aria-hidden
        data-testid={dataTestid}
        onClick={onScrimClick}
        className="absolute inset-0"
        style={{
          backdropFilter: `blur(${blurPx}px)`,
          WebkitBackdropFilter: `blur(${blurPx}px)`,
          background: tint,
          // Force the scrim onto its own GPU compositing layer. Without this,
          // mobile WebKit / WKWebView (web.ruta.media runs in a WebView) frequently
          // refuses to paint `backdrop-filter` at all — the blur silently no-ops and
          // you see only the flat tint (the "plain white background" bug). A
          // translateZ(0) + will-change hint makes the blur actually render, and
          // does so for BOTH surfaces because they share this one component.
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          willChange: 'backdrop-filter',
        }}
      />
      {children}
    </div>,
    document.body,
  );
}
