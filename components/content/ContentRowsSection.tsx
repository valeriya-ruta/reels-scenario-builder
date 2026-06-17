'use client';

import { useState } from 'react';
import ContentRows from '@/components/content/ContentRows';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Reusable list section that renders content pieces as the status rows (ring +
 * status label + colored type chip + time, with tap-to-open / tap-ring-advance /
 * long-press-picker). Used by the dedicated carousel / reels / stories list pages
 * so they share the unified "Твій контент" row UI.
 */
export default function ContentRowsSection({
  pieces,
  emptyText,
}: {
  pieces: ContentPiece[];
  emptyText: string;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const showHint = (msg: string) => {
    setHint(msg);
    window.setTimeout(() => setHint(null), 2500);
  };

  if (pieces.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface)]/60 px-6 py-14 text-center">
        <p className="mx-auto max-w-sm text-sm leading-normal text-zinc-700">{emptyText}</p>
      </div>
    );
  }

  return (
    <>
      <div data-testid="content-rows">
        <ContentRows pieces={pieces} onHint={showHint} />
      </div>
      {hint ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex justify-center px-4">
          <div className="rounded-full bg-black/85 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {hint}
          </div>
        </div>
      ) : null}
    </>
  );
}
