import { notFound } from 'next/navigation';
import { Clapperboard } from 'lucide-react';
import { getSharedReel } from '@/lib/reels/share';
import { displayTitle } from '@/lib/content/displayTitle';
import { estimateSeconds, formatDuration, shotSummary } from '@/lib/reels/blocks';
import ReelRecipe from '@/components/reels/ReelRecipe';

export const dynamic = 'force-dynamic';

/**
 * One reel, for the person who has to record it. No login, nothing to change.
 *
 * It opens on «Що знімаємо» rather than on the script, because the first
 * question is what to point a camera at. It renders through the SAME
 * `ReelRecipe` the builder's tabs use — the promise of the link is that this is
 * what the author sees, and a second renderer is how that quietly stops being
 * true.
 */
export default async function SharedReelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reel = await getSharedReel(token);
  if (!reel) notFound();

  const title = displayTitle(reel.title, 'reel');
  const seconds = estimateSeconds(reel.blocks);
  const shots = shotSummary(reel.blocks);

  return (
    <div className="min-h-[100dvh]" style={{ background: 'var(--canvas)' }}>
      <div className="mx-auto w-full max-w-[860px] px-4 pb-20 pt-6 md:px-8">
        <header className="mb-6">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            <Clapperboard className="h-3.5 w-3.5" strokeWidth={2.2} />
            Рілс
          </p>
          <h1 className="mt-1 break-words text-[26px] font-bold leading-tight tracking-tight text-[color:var(--foreground)]">
            {title}
          </h1>
          <p className="mt-1 text-[13px] font-medium text-[color:var(--text-muted)]">
            ~{formatDuration(seconds)}
            {shots ? ` · ${shots}` : ''}
          </p>
          {reel.note?.trim() ? (
            <p className="mt-2 max-w-prose whitespace-pre-wrap text-[14px] leading-relaxed text-[color:var(--text-muted)]">
              {reel.note}
            </p>
          ) : null}
        </header>

        {reel.blocks.length === 0 ? (
          <p className="rounded-[16px] border border-dashed border-[color:var(--border)] px-6 py-12 text-center text-[14px] text-[color:var(--text-muted)]">
            Цей рілс ще порожній.
          </p>
        ) : (
          <ReelRecipe blocks={reel.blocks} />
        )}
      </div>
    </div>
  );
}
