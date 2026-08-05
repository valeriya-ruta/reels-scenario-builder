'use client';

import { useMemo, useState } from 'react';
import type { ShareIdea, ShareDecision } from '@/lib/pro/share';

type Props = {
  token: string;
  ideas: ShareIdea[];
  initialDecisions: Record<string, ShareDecision>;
  projectName: string;
  projectColor: string;
  projectEmoji: string | null;
};

export default function ClientSwipeDeck({
  token,
  ideas,
  initialDecisions,
  projectName,
  projectColor,
  projectEmoji,
}: Props) {
  const [decisions, setDecisions] = useState<Record<string, ShareDecision>>(initialDecisions);
  const [index, setIndex] = useState(() => {
    // Resume at the first idea without a decision.
    const firstUndecided = ideas.findIndex((i) => !initialDecisions[i.id]);
    return firstUndecided === -1 ? ideas.length : firstUndecided;
  });
  const [drag, setDrag] = useState<{ x: number; start: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    let approved = 0;
    let rejected = 0;
    for (const v of Object.values(decisions)) {
      if (v === 'approved') approved += 1;
      else if (v === 'rejected') rejected += 1;
    }
    return { approved, rejected };
  }, [decisions]);

  async function decide(idea: ShareIdea, decision: ShareDecision) {
    if (busy) return;
    setBusy(true);
    setDecisions((d) => ({ ...d, [idea.id]: decision }));
    setIndex((i) => i + 1);
    setDrag(null);
    try {
      await fetch('/api/pro/share/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ideaId: idea.id, decision }),
      });
    } catch {
      /* optimistic — the operator can re-share if a write is dropped */
    } finally {
      setBusy(false);
    }
  }

  const current = ideas[index];
  const done = index >= ideas.length;
  const dx = drag?.x ?? 0;
  const rot = dx / 18;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
          style={{ background: `${projectColor}22`, boxShadow: `inset 0 0 0 2px ${projectColor}` }}
        >
          {projectEmoji ?? projectName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-zinc-900">{projectName}</p>
          <p className="text-xs text-zinc-500">Погодь ідеї для контенту</p>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-5 flex items-center gap-3 text-sm">
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">
          ✓ {counts.approved}
        </span>
        <span className="rounded-full bg-rose-50 px-2.5 py-0.5 font-medium text-rose-700">
          ✕ {counts.rejected}
        </span>
        <span className="ml-auto text-zinc-400">
          {Math.min(index, ideas.length)} / {ideas.length}
        </span>
      </div>

      {/* Card stack */}
      <div className="relative flex-1">
        {done ? (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <div className="text-4xl">🎉</div>
            <p className="mt-3 text-lg font-semibold text-zinc-900">Готово!</p>
            <p className="mt-1 text-sm text-zinc-500">
              Ти переглянув{ideas.length ? '' : ''} усі ідеї. Погоджено {counts.approved},
              відхилено {counts.rejected}.
            </p>
          </div>
        ) : (
          <>
            {/* Next card peeking behind */}
            {ideas[index + 1] && (
              <div className="absolute inset-0 top-3 scale-[0.97] rounded-3xl border border-zinc-200 bg-white opacity-60 shadow-sm" />
            )}
            <div
              className="absolute inset-0 select-none rounded-3xl border border-zinc-200 bg-white p-6 shadow-lg"
              style={{
                transform: `translateX(${dx}px) rotate(${rot}deg)`,
                transition: drag ? 'none' : 'transform 0.25s ease',
                touchAction: 'pan-y',
              }}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                setDrag({ x: 0, start: e.clientX });
              }}
              onPointerMove={(e) => {
                if (!drag) return;
                setDrag({ x: e.clientX - drag.start, start: drag.start });
              }}
              onPointerUp={() => {
                if (!drag) return;
                if (drag.x > 110) decide(current, 'approved');
                else if (drag.x < -110) decide(current, 'rejected');
                else setDrag(null);
              }}
            >
              {/* swipe hints */}
              <div
                className="pointer-events-none absolute right-5 top-5 rounded-lg border-2 border-emerald-500 px-2 py-0.5 text-sm font-bold text-emerald-500"
                style={{ opacity: Math.max(0, Math.min(1, dx / 110)) }}
              >
                ПОГОДЖЕНО
              </div>
              <div
                className="pointer-events-none absolute left-5 top-5 rounded-lg border-2 border-rose-500 px-2 py-0.5 text-sm font-bold text-rose-500"
                style={{ opacity: Math.max(0, Math.min(1, -dx / 110)) }}
              >
                НІ
              </div>

              <div className="flex h-full min-h-[360px] flex-col">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Ідея {index + 1}
                </span>
                {current.title && (
                  <h2 className="mt-2 text-xl font-bold text-zinc-900">{current.title}</h2>
                )}
                <p className="mt-3 flex-1 overflow-y-auto whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">
                  {current.content || '—'}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Buttons */}
      {!done && (
        <div className="mt-5 flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => decide(current, 'rejected')}
            disabled={busy}
            className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-200 bg-white text-2xl text-rose-500 shadow-md transition hover:scale-105 hover:border-rose-300 disabled:opacity-50"
            aria-label="Відхилити"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={() => decide(current, 'approved')}
            disabled={busy}
            className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-200 bg-white text-2xl text-emerald-500 shadow-md transition hover:scale-105 hover:border-emerald-300 disabled:opacity-50"
            aria-label="Погодити"
          >
            ✓
          </button>
        </div>
      )}

      <p className="mt-5 text-center text-xs text-zinc-400">
        Свайп праворуч — погодити, ліворуч — відхилити
      </p>
    </div>
  );
}
