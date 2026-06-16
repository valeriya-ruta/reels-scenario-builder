'use client';

import { useMemo, useState } from 'react';
import ContentRows from '@/components/content/ContentRows';
import StatusFilter from '@/components/content/StatusFilter';
import type { ContentPiece } from '@/lib/content/contentPiece';
import type { ContentStatus } from '@/lib/content/statusSystem';

/**
 * Full "Твій контент" library (Status system 6/8 + 7/8).
 * Lists ALL the user's content pieces, most-recent-first, with interactive rows
 * (tap-ring advance / long-press picker / tap-open) and a status filter
 * (checkbox multiselect + removable chips + "Усі" reset, OR semantics).
 */
export default function ContentLibrary({ pieces }: { pieces: ContentPiece[] }) {
  const [hint, setHint] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<ContentStatus[]>([]);
  const showHint = (msg: string) => {
    setHint(msg);
    window.setTimeout(() => setHint(null), 2500);
  };

  const toggleStatus = (s: ContentStatus) =>
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  // OR semantics: a piece matches if its status is among the selected ones.
  const visible = useMemo(() => {
    if (statuses.length === 0) return pieces;
    const set = new Set(statuses);
    return pieces.filter((p) => set.has(p.status));
  }, [pieces, statuses]);

  return (
    <div className="min-h-screen bg-[color:var(--background)]">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="font-display text-2xl font-semibold text-[color:var(--foreground)]">
          Твій контент
        </h1>

        {pieces.length > 0 ? (
          <div className="mt-4">
            <StatusFilter selected={statuses} onToggle={toggleStatus} onClear={() => setStatuses([])} />
          </div>
        ) : null}

        {pieces.length === 0 ? (
          <div
            data-testid="content-empty"
            className="mt-10 rounded-2xl bg-[color:var(--surface)] px-6 py-12 text-center"
          >
            <p className="text-base font-semibold text-[color:var(--foreground)]">
              Тут житиме твій контент
            </p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-zinc-500">
              Кинь ідею, збери карусель чи рілс — і все зʼявиться тут, від першої думки до
              «Опубліковано».
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-10 rounded-2xl bg-[color:var(--surface)] px-6 py-10 text-center" data-testid="content-filter-empty">
            <p className="text-sm text-zinc-500">Нічого з таким статусом. Спробуй інший фільтр.</p>
          </div>
        ) : (
          <div className="mt-4" data-testid="content-list">
            <ContentRows pieces={visible} onHint={showHint} />
          </div>
        )}
      </div>

      {hint ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex justify-center px-4">
          <div className="rounded-full bg-black/85 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {hint}
          </div>
        </div>
      ) : null}
    </div>
  );
}
