'use client';

import { useState } from 'react';
import ContentRows from '@/components/content/ContentRows';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Full "Твій контент" library (Status system 6/8 — task 86d3btmqq).
 * Lists ALL the user's content pieces, most-recent-first, with the interactive
 * rows (tap-ring advance / long-press picker / tap-open). A filter slot sits at
 * the top for the status filter (task 7/8); a `renderFilter` prop lets that task
 * inject the control without restructuring this page.
 */
export default function ContentLibrary({
  pieces,
  renderFilter,
}: {
  pieces: ContentPiece[];
  renderFilter?: (ctx: { total: number }) => React.ReactNode;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const showHint = (msg: string) => {
    setHint(msg);
    window.setTimeout(() => setHint(null), 2500);
  };

  return (
    <div className="min-h-screen bg-[color:var(--background)]">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="font-display text-2xl font-semibold text-[color:var(--foreground)]">
          Твій контент
        </h1>

        {renderFilter ? <div className="mt-4">{renderFilter({ total: pieces.length })}</div> : null}

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
        ) : (
          <div className="mt-4" data-testid="content-list">
            <ContentRows pieces={pieces} onHint={showHint} />
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
