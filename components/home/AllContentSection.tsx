'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import ContentRows from '@/components/content/ContentRows';
import ProposingEmptyState from '@/components/propose/ProposingEmptyState';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * ВЕСЬ КОНТЕНТ — the bottom of the stack (Prompt 7).
 *
 * Everything, all types, all statuses. It sits last on purpose: the stack is
 * ranked by urgency, and «what exists» is the least urgent question on the
 * screen. «Усі» opens the full library with its filters.
 */
export default function AllContentSection({ pieces }: { pieces: ContentPiece[] }) {
  return (
    <section className="space-y-2.5" aria-labelledby="all-content-heading">
      <div className="flex items-center justify-between px-0.5">
        <h2 id="all-content-heading" className="app-section-label">
          Весь контент
        </h2>
        <Link
          href="/content"
          data-testid="all-content-link"
          className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-[color:var(--accent)]"
        >
          Усі
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {pieces.length === 0 ? (
        <div data-testid="all-content-empty">
          <ProposingEmptyState
            headline="Почнімо з одного з цих"
            sub="Тапни напрямок — далі просто наговори своїми словами."
          />
        </div>
      ) : (
        <div data-testid="all-content-list">
          <ContentRows pieces={pieces} />
        </div>
      )}
    </section>
  );
}
