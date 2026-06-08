'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Insights coming-soon skeleton. A single subtle card with an "Інсайти" header,
 * a neutral "Скоро" pill, a few shimmer placeholder lines and a one-line caption.
 * Non-interactive except for the × dismiss in the top-right.
 *
 * Dismissal is persisted per-user in localStorage (there is no server flag for a
 * coming-soon teaser, so local persistence is used — it survives reloads on the
 * same device). Once dismissed it never renders again.
 */
const DISMISS_KEY = 'ruta:home:insights-dismissed';

export default function InsightsSkeleton() {
  // Start hidden to avoid a flash before we can read localStorage; reveal after
  // the mount check if not previously dismissed.
  const [state, setState] = useState<'pending' | 'visible' | 'dismissed'>('pending');

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(DISMISS_KEY) === '1';
      setState(dismissed ? 'dismissed' : 'visible');
    } catch {
      setState('visible');
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore persistence failure — still hide for this session */
    }
    setState('dismissed');
  };

  if (state !== 'visible') return null;

  return (
    <section
      data-testid="insights-skeleton"
      className="relative rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Сховати"
        data-testid="insights-dismiss"
        className="absolute right-2.5 top-2.5 rounded-lg p-1 text-zinc-400 transition-colors hover:bg-[color:var(--surface2)] hover:text-zinc-600"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>

      <div className="flex items-center gap-2 pr-6">
        <h2 className="font-display text-base font-semibold text-zinc-700">Інсайти</h2>
        <span className="rounded-full bg-[color:var(--surface2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Скоро
        </span>
      </div>

      <div className="mt-3 space-y-2" aria-hidden>
        <div className="reels-planner-skeleton-shimmer h-3 w-3/4 rounded-full" />
        <div className="reels-planner-skeleton-shimmer h-3 w-1/2 rounded-full" />
        <div className="reels-planner-skeleton-shimmer h-3 w-2/3 rounded-full" />
      </div>

      <p className="mt-3 text-xs leading-normal text-zinc-500">
        Скоро тут зʼявиться що працює, а що ні.
      </p>
    </section>
  );
}
