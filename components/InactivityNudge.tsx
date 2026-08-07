'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Inactivity nudge for the content-creation screens (reel scenario, carousel,
 * storytelling editors).
 *
 * When you sit on an editor for a long stretch WITHOUT taking any action —
 * no typing, no clicking, no scrolling, no pointer movement — Ruta pops up a
 * gentle reminder: the best content is the one you actually posted, so finish
 * it now. The whole point is to break the staring-at-a-blank-page freeze, not
 * to interrupt someone who is actively working, so ANY interaction resets the
 * clock and time spent on another tab does not count.
 *
 * Mounted per-editor (see ProjectBuilder / CarouselPageClient /
 * StorytellingBuilder), so it only ever fires on the creation screens.
 */

const DEFAULT_IDLE_MS = 10 * 60 * 1000; // 10 minutes of no action
const CHECK_MS = 15 * 1000; // how often we compare against the idle threshold

// Every one of these counts as "taking an action" and re-arms the timer.
const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
] as const;

interface InactivityNudgeProps {
  /** Idle window before the nudge appears. Overridable mainly for tests. */
  idleMs?: number;
}

export default function InactivityNudge({ idleMs = DEFAULT_IDLE_MS }: InactivityNudgeProps) {
  const [open, setOpen] = useState(false);
  // Seeded on mount inside the effect below — Date.now() must not run during render.
  const lastActivityRef = useRef<number>(0);
  const openRef = useRef(false);

  // Mirror `open` into a ref so the polling interval (registered once) can read
  // the latest value without being torn down and rebuilt on every toggle.
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    // Start the idle clock now, on the client, rather than at render time.
    lastActivityRef.current = Date.now();

    const markActive = () => {
      lastActivityRef.current = Date.now();
    };

    // Passive listeners: we only ever read a timestamp, never preventDefault,
    // so this stays off the scroll/gesture critical path.
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, markActive, { passive: true }),
    );

    // Coming back to the tab shouldn't instantly trip the nudge — time on
    // another tab isn't "staring at this page", so treat a return as activity.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastActivityRef.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // A single low-frequency poll instead of clear/set-timeout on every
    // mousemove: comparing one timestamp is far cheaper than churning timers.
    const interval = window.setInterval(() => {
      if (openRef.current) return; // already nudging — don't stack
      if (Date.now() - lastActivityRef.current >= idleMs) {
        setOpen(true);
      }
    }, CHECK_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive));
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [idleMs]);

  const dismiss = useCallback(() => {
    // Re-arm from now: if they go quiet for another full window, nudge again.
    lastActivityRef.current = Date.now();
    setOpen(false);
  }, []);

  // Lock background scroll + wire Escape while the nudge is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, dismiss]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-nudge-title"
      data-testid="inactivity-nudge"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={dismiss}
        aria-label="Закрити нагадування"
      />

      <div
        className="relative z-[1] w-full max-w-md rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] px-7 py-9 text-center shadow-[var(--elev-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="inactivity-nudge-title"
          className="font-display text-xl font-bold leading-snug tracking-tight text-zinc-900 sm:text-[1.4rem]"
        >
          Гей, я помітила, що ти вже давненько дивишся на цю сторінку 👀
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-[color:var(--text-secondary)]">
          Просто нагадую: найкращий контент — це той, який ти реально опублікувала,
          а не той, що так і лишився недописаним.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--text-secondary)]">
          Тож давай закінчимо його прямо зараз! Пиши так, як думаєш, і не дай нічому
          себе спинити 💛
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="btn-primary mt-7 w-full rounded-xl bg-[color:var(--accent)] px-6 py-3.5 text-sm font-semibold text-white transition-[background,transform] hover:brightness-110"
        >
          Дописати зараз ✍️
        </button>
      </div>
    </div>,
    document.body,
  );
}
