'use client';

import ContentRows from '@/components/content/ContentRows';
import ProposingEmptyState from '@/components/propose/ProposingEmptyState';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Today's content (Prompt 3) — a mini-calendar scoped to exactly one day.
 *
 * The agenda below still answers "and what's next?"; this answers the only
 * question that matters when you open the app: what am I posting TODAY. It
 * reuses the real content cards so a piece looks the same here as everywhere.
 *
 * With nothing scheduled it becomes a proposing empty state, not a "нічого
 * немає" — an empty today is the moment the assistant is most useful.
 */
export default function TodayWidget({ pieces }: { pieces: ContentPiece[] }) {
  return (
    <section className="space-y-2.5" aria-labelledby="today-heading">
      <h2 id="today-heading" className="app-section-label px-0.5">
        Сьогодні
      </h2>

      {pieces.length === 0 ? (
        <div data-testid="today-empty">
          <ProposingEmptyState
            headline="На сьогодні нічого не заплановано"
            sub="Можна зробити щось швидке — ось із чого я б почала."
            limit={2}
          />
        </div>
      ) : (
        <div data-testid="today-list">
          <ContentRows pieces={pieces} />
        </div>
      )}
    </section>
  );
}
