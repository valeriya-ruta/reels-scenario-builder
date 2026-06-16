'use client';

import Link from 'next/link';
import ContentRows from '@/components/content/ContentRows';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Home "Твій контент" recents (Status system 8/8 — task 86d3btmvp).
 * Lean: shows only the latest few pieces using the shared content rows + their
 * interactions (tap-ring advance / long-press picker / tap-open), with "Усі →"
 * to the full library. The full list lives at /content.
 */
export default function HomeRecents({ pieces }: { pieces: ContentPiece[] }) {
  return (
    <section className="space-y-2" aria-labelledby="recents-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="recents-heading" className="font-display text-lg font-semibold text-black">
          Твій контент
        </h2>
        <Link
          href="/content"
          data-testid="recents-all-link"
          className="text-sm font-medium text-[color:var(--accent)] hover:underline"
        >
          Усі →
        </Link>
      </div>

      {pieces.length === 0 ? (
        <div
          data-testid="recents-empty"
          className="rounded-xl bg-[color:var(--surface)] px-4 py-6 text-center"
        >
          <p className="text-sm font-medium text-zinc-700">Поки що порожньо</p>
          <p className="mt-1 text-sm leading-normal text-zinc-500">
            Натисни <span className="font-semibold text-[color:var(--accent)]">＋</span>, щоб
            створити перший контент.
          </p>
        </div>
      ) : (
        <div data-testid="recents-list">
          <ContentRows pieces={pieces} />
        </div>
      )}
    </section>
  );
}
