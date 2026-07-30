'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * iOS-style bottom sheet (app-wide UI system). Slides up from the bottom over a
 * dimmed backdrop, rounded top, grab handle. The native pattern that reads as an
 * app (Linear / monday / Substack) rather than a shrunk webpage. Used for the
 * status picker, date picker, and other quick actions.
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
      const r = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), 240);
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

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={title}>
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/35 transition-opacity duration-200"
        style={{ opacity: shown ? 1 : 0 }}
        aria-hidden
      />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-[22px] border border-b-0 border-[color:var(--border)] bg-[color:var(--background)] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_40px_rgba(0,0,0,0.16)]"
        style={{
          transform: shown ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 240ms cubic-bezier(0.22,1,0.36,1)',
          maxHeight: '82vh',
        }}
      >
        <div className="flex justify-center pb-1 pt-2.5">
          <span className="h-1 w-9 rounded-full bg-zinc-300" />
        </div>
        {title ? (
          <h3 className="px-5 pb-1 pt-1 text-center text-[15px] font-semibold text-[color:var(--foreground)]">
            {title}
          </h3>
        ) : null}
        <div className="max-h-[74vh] overflow-y-auto px-4 pb-5 pt-1" style={{ overscrollBehavior: 'contain' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
