'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import ContentRows from '@/components/content/ContentRows';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Home "Твій контент" recents (app UI system). A titled section over a grouped
 * card of content rows, with "Усі" to the full library — the standard
 * section-header + card-group pattern.
 */
export default function HomeRecents({ pieces }: { pieces: ContentPiece[] }) {
  return (
    <section className="space-y-2.5" aria-labelledby="recents-heading">
      <div className="flex items-center justify-between px-0.5">
        <h2 id="recents-heading" className="app-section-label">
          Твій контент
        </h2>
        <Link
          href="/content"
          data-testid="recents-all-link"
          className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-[color:var(--accent)]"
        >
          Усі
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {pieces.length === 0 ? (
        <div data-testid="recents-empty" className="app-card px-5 py-8 text-center">
          <p className="text-[15px] font-semibold text-[color:var(--foreground)]">Поки що порожньо</p>
          <p className="mx-auto mt-1 max-w-[15rem] text-[13px] leading-relaxed text-[color:var(--text-muted)]">
            Створи перший контент — з ідеї, рілса, каруселі чи сторіс.
          </p>
        </div>
      ) : (
        <div data-testid="recents-list" className="app-card overflow-hidden px-1.5 py-0.5">
          <ContentRows pieces={pieces} />
        </div>
      )}
    </section>
  );
}
