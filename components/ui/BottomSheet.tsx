'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * iOS-style bottom sheet (app UI system). Slides up from the bottom over a
 * dimmed backdrop, rounded top, grab handle.
 *
 * Portalled to <body> so it is never clipped by (or stacked under) the floating
 * bottom nav or a scrolling `overflow` ancestor — that's what hid the last
 * option behind the navbar. Content also clears the nav's height.
 *
 * Animation: mount at translateY(100%), then flip on the NEXT frame (double
 * rAF) so the browser paints the closed state first and actually transitions —
 * a single rAF can batch with the mount render and the sheet just appears.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
      };
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), 260);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/35 transition-opacity duration-[240ms]"
        style={{ opacity: shown ? 1 : 0 }}
        aria-hidden
      />
      {/* Mobile: iOS bottom sheet (full width, slides up). Desktop: a centered,
          width-capped modal so it never spans the whole screen. */}
      <div
        className="relative w-full rounded-t-[22px] border border-b-0 border-[color:var(--border)] bg-[color:var(--background)] shadow-[0_-8px_40px_rgba(0,0,0,0.16)] sm:w-full sm:max-w-md sm:rounded-[22px] sm:border-b sm:shadow-[0_20px_60px_rgba(0,0,0,0.22)]"
        style={{
          transform: shown ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 280ms cubic-bezier(0.22,1,0.36,1)',
          maxHeight: '82vh',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex justify-center pb-1 pt-2.5 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-zinc-300" />
        </div>
        {title ? (
          <h3 className="px-5 pb-1 pt-1 text-center text-[15px] font-semibold text-[color:var(--foreground)] sm:pt-4">
            {title}
          </h3>
        ) : null}
        <div className="max-h-[70vh] overflow-y-auto px-4 pt-1" style={{ overscrollBehavior: 'contain' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
