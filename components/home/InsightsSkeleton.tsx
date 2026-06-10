'use client';

import { useEffect, useState } from 'react';
import { Video, Clock, TrendingUp, X } from 'lucide-react';
import { CONTENT_TYPES } from '@/lib/contentTypes';

/**
 * Insights teaser. Instead of a loading-style shimmer, this renders a realistic
 * fake insights panel behind a blur with a sharp "Скоро" lockup on top — it reads
 * as "a real feature you can't see yet," not a loading state. Task 86d39djfz.
 *
 * ALL numbers are static placeholders — nothing is wired to real analytics.
 * Dismissal is persisted per-user in localStorage (no server flag for a
 * coming-soon teaser); once dismissed it never renders again on this device.
 */
const DISMISS_KEY = 'ruta:home:insights-dismissed';

/** Static fake bars for the mini-chart (heights in %). Not real data. */
const FAKE_BARS = [38, 54, 30, 72, 48, 88, 64];

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

  const reelsTint = CONTENT_TYPES.reels.color;

  return (
    <section
      data-testid="insights-skeleton"
      className="relative overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Сховати"
        data-testid="insights-dismiss"
        className="absolute right-2.5 top-2.5 z-20 rounded-lg p-1 text-zinc-400 transition-colors hover:bg-[color:var(--surface2)] hover:text-zinc-600"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>

      <div className="flex items-center gap-2 pr-6">
        <h2 className="font-display text-base font-semibold text-zinc-700">Інсайти</h2>
      </div>

      {/* Preview region: realistic FAKE content behind a blur + a sharp lockup. */}
      <div className="relative mt-3">
        {/* Fake insights content — blurred and non-interactive (decorative). */}
        <div
          aria-hidden
          className="select-none space-y-3"
          style={{ filter: 'blur(7px)', opacity: 0.9 }}
        >
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: CONTENT_TYPES.reels.soft, color: reelsTint }}
            >
              <Video className="h-4 w-4" />
            </span>
            <p className="text-sm text-zinc-700">
              Твій найкращий рілс цього тижня · <span className="font-semibold">12.4k переглядів</span>
            </p>
          </div>

          {/* Static bar mini-chart (no chart lib, not real data). */}
          <div className="flex h-16 items-end gap-1.5 rounded-lg bg-white/70 px-3 py-2">
            {FAKE_BARS.map((h, i) => (
              <span
                key={i}
                className="flex-1 rounded-sm"
                style={{ height: `${h}%`, backgroundColor: i === 5 ? reelsTint : '#c7cad1' }}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-200 text-zinc-600">
              <Clock className="h-4 w-4" />
            </span>
            <p className="text-sm text-zinc-700">
              Найкращий час для постингу · <span className="font-semibold">19:00</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-200 text-zinc-600">
              <TrendingUp className="h-4 w-4" />
            </span>
            <p className="text-sm text-zinc-700">
              Залученість · <span className="font-semibold">+18% за тиждень</span>
            </p>
          </div>
        </div>

        {/* Light scrim so the content is suggested, not readable. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl bg-[color:var(--surface)]/35"
        />

        {/* Sharp lockup on top — the only legible thing. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600 shadow-sm">
            Скоро
          </span>
          <p className="max-w-[16rem] text-xs font-medium leading-snug text-zinc-600">
            Тут зʼявиться що працює, а що ні
          </p>
        </div>
      </div>
    </section>
  );
}
