'use client';

import { useMemo, useState } from 'react';
import ContentRows from '@/components/content/ContentRows';
import StatusFilter from '@/components/content/StatusFilter';
import ProposingEmptyState from '@/components/propose/ProposingEmptyState';
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
    <div className="app-canvas">
      <div className="app-page">
        <div className="px-0.5">
          <h1 className="app-title">Твій контент</h1>
          {pieces.length > 0 ? <p className="app-subtitle">{pieces.length} матеріалів</p> : null}
        </div>

        {pieces.length > 0 ? (
          <div className="mt-4">
            <StatusFilter selected={statuses} onToggle={toggleStatus} onClear={() => setStatuses([])} />
          </div>
        ) : null}

        {pieces.length === 0 ? (
          <div data-testid="content-empty" className="mt-6">
            <ProposingEmptyState
              headline="Ось із чого я б почала"
              sub="Тапни напрямок — далі просто наговори своїми словами."
              limit={3}
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="app-card mt-6 px-6 py-10 text-center" data-testid="content-filter-empty">
            <p className="text-[13px] text-[color:var(--text-muted)]">
              Нічого не знайдено за цим фільтром.
            </p>
          </div>
        ) : (
          <div className="app-card mt-4 overflow-hidden px-1.5 py-0.5" data-testid="content-list">
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
