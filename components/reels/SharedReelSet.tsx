'use client';

import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, Camera, Clapperboard, Clock } from 'lucide-react';
import ReelRecipe from '@/components/reels/ReelRecipe';
import { displayTitle } from '@/lib/content/displayTitle';
import { dayHeaderLabel } from '@/lib/content/calendar';
import {
  editKey,
  editList,
  estimateSeconds,
  formatDuration,
  shotKey,
  shotList,
  type ReelBlock,
} from '@/lib/reels/blocks';

/**
 * What a share link opens for the person doing the work.
 *
 * One reel goes straight to its recipe; several open as a LIST first, because
 * fifteen recipes stacked on one page is not something anyone reads — you pick
 * the one you are shooting now.
 *
 * Ticking is optimistic: the box fills immediately and the write follows. If the
 * write fails the tick is rolled back, because a checkbox that silently forgets
 * is worse than one that refuses.
 */

type SharedReel = {
  id: string;
  title: string;
  scheduledDate: string | null;
  blocks: ReelBlock[];
};

/** How much of one reel is already done — shown on its row in the list. */
function progressOf(blocks: ReelBlock[], done: ReadonlySet<string>) {
  const keys = [...shotList(blocks).map(shotKey), ...editList(blocks).map(editKey)];
  const finished = keys.filter((k) => done.has(k)).length;
  return { total: keys.length, finished };
}

export default function SharedReelSet({
  token,
  title,
  note,
  reels,
  initialDone,
}: {
  token: string;
  title: string | null;
  note: string | null;
  reels: SharedReel[];
  initialDone: string[];
}) {
  const [done, setDone] = useState<Set<string>>(() => new Set(initialDone));
  const [openId, setOpenId] = useState<string | null>(reels.length === 1 ? reels[0].id : null);

  const open = reels.find((r) => r.id === openId) ?? null;

  const toggle = useCallback(
    (key: string, next: boolean) => {
      const [blockId, ...rest] = key.split(':');
      const slot = rest.join(':');

      setDone((prev) => {
        const copy = new Set(prev);
        if (next) copy.add(key);
        else copy.delete(key);
        return copy;
      });

      void fetch('/api/share/reel/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, blockId, slot, done: next }),
      })
        .then((res) => {
          if (res.ok) return;
          // Roll back rather than leave a tick that did not save.
          setDone((prev) => {
            const copy = new Set(prev);
            if (next) copy.delete(key);
            else copy.add(key);
            return copy;
          });
        })
        .catch(() => {
          setDone((prev) => {
            const copy = new Set(prev);
            if (next) copy.delete(key);
            else copy.add(key);
            return copy;
          });
        });
    },
    [token],
  );

  const rows = useMemo(
    () =>
      reels.map((r) => ({
        reel: r,
        seconds: estimateSeconds(r.blocks),
        ...progressOf(r.blocks, done),
      })),
    [reels, done],
  );

  return (
    <div className="min-h-[100dvh]" style={{ background: 'var(--canvas)' }}>
      <div className="mx-auto w-full max-w-[900px] px-4 pb-20 pt-6 md:px-8">
        {open && reels.length > 1 ? (
          <button
            type="button"
            onClick={() => setOpenId(null)}
            data-testid="shared-back"
            className="mb-4 flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--foreground)]"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
            Усі рілси ({reels.length})
          </button>
        ) : null}

        {!open ? (
          <>
            <header className="mb-6">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                <Clapperboard className="h-3.5 w-3.5" strokeWidth={2.2} />
                {reels.length} {reels.length === 1 ? 'рілс' : 'рілсів'}
              </p>
              <h1 className="mt-1 break-words text-[26px] font-bold leading-tight tracking-tight text-[color:var(--foreground)]">
                {title?.trim() || 'Рілси на зйомку'}
              </h1>
              {note?.trim() ? (
                <p className="mt-2 max-w-prose whitespace-pre-wrap text-[14px] leading-relaxed text-[color:var(--text-muted)]">
                  {note}
                </p>
              ) : null}
            </header>

            <ol className="flex flex-col gap-2.5">
              {rows.map(({ reel, seconds, total, finished }) => {
                const complete = total > 0 && finished === total;
                return (
                  <li key={reel.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(reel.id)}
                      data-testid="shared-reel-row"
                      className="flex w-full cursor-pointer items-center gap-4 rounded-[16px] border bg-[color:var(--background)] p-4 text-left transition-colors hover:border-[color:var(--border-strong)]"
                      style={{
                        borderColor: complete ? '#0F8A6A' : 'var(--border)',
                        boxShadow: 'var(--elev-1)',
                        opacity: complete ? 0.7 : 1,
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-[15.5px] font-semibold leading-snug text-[color:var(--foreground)]">
                          {displayTitle(reel.title, 'reel')}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[color:var(--text-muted)]">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />~{formatDuration(seconds)}
                          </span>
                          {reel.scheduledDate && <span>{dayHeaderLabel(reel.scheduledDate)}</span>}
                        </p>
                      </div>

                      {/* Progress is the point of the list: at a glance, what is
                          left to do rather than what exists. */}
                      {total > 0 && (
                        <span
                          className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold tabular-nums"
                          style={{
                            backgroundColor: complete ? '#0F8A6A' : 'var(--surface1)',
                            color: complete ? '#fff' : 'var(--text-muted)',
                          }}
                        >
                          {finished}/{total}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <>
            <header className="mb-6">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                <Camera className="h-3.5 w-3.5" strokeWidth={2.2} />
                Рілс
              </p>
              <h1 className="mt-1 break-words text-[24px] font-bold leading-tight tracking-tight text-[color:var(--foreground)]">
                {displayTitle(open.title, 'reel')}
              </h1>
              <p className="mt-1 text-[13px] font-medium text-[color:var(--text-muted)]">
                ~{formatDuration(estimateSeconds(open.blocks))}
                {open.scheduledDate ? ` · ${dayHeaderLabel(open.scheduledDate)}` : ''}
              </p>
            </header>

            {open.blocks.length === 0 ? (
              <p className="rounded-[16px] border border-dashed border-[color:var(--border)] px-6 py-12 text-center text-[14px] text-[color:var(--text-muted)]">
                Цей рілс ще порожній.
              </p>
            ) : (
              <ReelRecipe blocks={open.blocks} done={done} onToggleDone={toggle} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
