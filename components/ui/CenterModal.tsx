'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Centred modal card (app UI system). Springs up from slightly-below with a
 * scale+fade — the FAB-menu feel — over a dimmed backdrop. Portalled to <body>
 * so it is never clipped by or stacked under the floating bottom nav.
 *
 * Used where a bottom sheet feels wrong (e.g. the calendar's create menu):
 * a compact set of choices reads better centred than pinned to the bottom edge.
 */
export default function CenterModal({
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
    const t = window.setTimeout(() => setMounted(false), 220);
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
      className="fixed inset-0 z-[120] flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 transition-opacity duration-200"
        style={{ opacity: shown ? 1 : 0 }}
        aria-hidden
      />
      <div
        className="relative w-full max-w-[320px] rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-2.5 shadow-[var(--elev-3)]"
        style={{
          opacity: shown ? 1 : 0,
          transform: shown ? 'translateY(0) scale(1)' : 'translateY(14px) scale(0.94)',
          transition: 'transform 260ms cubic-bezier(0.34,1.4,0.64,1), opacity 180ms ease',
        }}
      >
        {title ? (
          <h3 className="px-2 pb-1.5 pt-2 text-center text-[13px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            {title}
          </h3>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
