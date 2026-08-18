'use client';

import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, Camera, Clapperboard, Clock, Maximize2, Minimize2 } from 'lucide-react';
import ReelRecipe from '@/components/reels/ReelRecipe';
import { displayTitle } from '@/lib/content/displayTitle';
import { dayHeaderLabel } from '@/lib/content/calendar';
import {
  AUDIO_LABELS,
  editKey,
  editList,
  estimateSeconds,
  flowBeats,
  formatDuration,
  shotKey,
  shotList,
  shotSummary,
  type AudioSource,
  type ReelBlock,
  type RefImage,
} from '@/lib/reels/blocks';

/**
 * What a share link opens for the person doing the work.
 *
 * On a wide screen it is a split: every reel on the left, the open one on the
 * right. You are working through a batch — the list is the plan and the recipe
 * is the task, and hiding one to see the other loses your place. The ⤢ button
 * drops the list and gives the recipe the whole page for when you are actually
 * shooting.
 *
 * Narrow screens keep list → detail → back, because 50/50 of a phone is two
 * unusable halves.
 *
 * Ticking is optimistic: the box fills immediately and the write follows. If the
 * write fails the tick is rolled back, because a checkbox that silently forgets
 * is worse than one that refuses.
 */

type SharedReel = {
  id: string;
  title: string;
  scheduledDate: string | null;
  defaultAudio: string | null;
  overview: string | null;
  references: RefImage[];
  blocks: ReelBlock[];
};

/** The first thing said or shown — a one-line answer to "what is this reel". */
function openingLine(blocks: ReelBlock[]): string | null {
  const beats = flowBeats(blocks);
  for (const beat of beats) {
    const line = beat.saying ?? beat.screenText[0] ?? beat.onScreen[0] ?? '';
    const clean = line.trim().replace(/\s+/g, ' ');
    if (clean) return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
  }
  return null;
}

/** The reel's sound, as a value the block model understands. */
function reelAudioOf(r: SharedReel): AudioSource | null {
  return AUDIO_LABELS[r.defaultAudio as AudioSource] ? (r.defaultAudio as AudioSource) : null;
}

/** How much of one reel is already done — shown on its row in the list. */
function progressOf(blocks: ReelBlock[], done: ReadonlySet<string>, audio: AudioSource | null) {
  const keys = [...shotList(blocks).map(shotKey), ...editList(blocks, audio).map(editKey)];
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
  const [focus, setFocus] = useState(false);

  const single = reels.length === 1;
  // Split view always has something on the right — an empty half is wasted page.
  const shown = reels.find((r) => r.id === openId) ?? reels[0] ?? null;
  // The narrow flow is stricter: nothing is open until a row is tapped.
  const openNarrow = reels.find((r) => r.id === openId) ?? null;

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
        ...progressOf(r.blocks, done, reelAudioOf(r)),
      })),
    [reels, done],
  );

  /** One row of the reel list, in both layouts. */
  const renderRow = (
    { reel, seconds, total, finished }: (typeof rows)[number],
    { compact }: { compact: boolean },
  ) => {
    const complete = total > 0 && finished === total;
    const selected = compact && reel.id === shown?.id;
    return (
      <button
        type="button"
        onClick={() => setOpenId(reel.id)}
        data-testid="shared-reel-row"
        data-selected={selected ? 'true' : 'false'}
        className={`flex w-full cursor-pointer items-center gap-3 rounded-[16px] border bg-[color:var(--background)] text-left transition-colors hover:border-[color:var(--border-strong)] ${
          compact ? 'p-3' : 'p-4'
        }`}
        style={{
          borderColor: selected
            ? 'var(--accent)'
            : complete
              ? '#0F8A6A'
              : 'var(--border)',
          boxShadow: selected ? 'none' : 'var(--elev-1)',
          backgroundColor: selected ? 'var(--surface1)' : undefined,
          opacity: complete && !selected ? 0.7 : 1,
        }}
      >
        <div className="min-w-0 flex-1">
          <p
            className={`break-words font-semibold leading-snug text-[color:var(--foreground)] ${
              compact ? 'text-[14px]' : 'text-[15.5px]'
            }`}
          >
            {displayTitle(reel.title, 'reel')}
          </p>
          {/* A title alone does not say what a reel is — the opening line does,
              and picking one out of fifteen is the whole job of this list. */}
          {openingLine(reel.blocks) && (
            <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[color:var(--text-muted)]">
              {openingLine(reel.blocks)}
            </p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[color:var(--text-muted)]">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />~{formatDuration(seconds)}
            </span>
            {reel.scheduledDate && <span>{dayHeaderLabel(reel.scheduledDate)}</span>}
          </p>
        </div>

        {/* Progress is the point of the list: at a glance, what is left to do
            rather than what exists. A bare «0/13» reads as a mystery number,
            so it says what it counts — every shot to get and every editing
            instruction for this reel, together. */}
        {total > 0 && (
          <span
            data-testid="reel-progress"
            title="Скільки пунктів уже відмічено — те, що треба зняти чи знайти, плюс те, що робить монтаж"
            className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold tabular-nums"
            style={{
              backgroundColor: complete ? '#0F8A6A' : 'var(--surface1)',
              color: complete ? '#fff' : 'var(--text-muted)',
            }}
          >
            {finished}/{total} <span className="font-semibold">готово</span>
          </span>
        )}
      </button>
    );
  };

  /** The recipe for one reel, with its own heading. */
  const renderDetail = (reel: SharedReel, opts: { canFocus: boolean }) => (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            <Camera className="h-3.5 w-3.5" strokeWidth={2.2} />
            Рілс
          </p>
          <h2 className="mt-1 break-words text-[22px] font-bold leading-tight tracking-tight text-[color:var(--foreground)]">
            {displayTitle(reel.title, 'reel')}
          </h2>
          <p className="mt-1 text-[13px] font-medium text-[color:var(--text-muted)]">
            ~{formatDuration(estimateSeconds(reel.blocks))}
            {reel.scheduledDate ? ` · ${dayHeaderLabel(reel.scheduledDate)}` : ''}
            {shotSummary(reel.blocks) ? ` · ${shotSummary(reel.blocks)}` : ''}
          </p>

          {/* The opening line IS what the reel is about. Someone who has never
              seen it should not have to read a shot list to find that out. */}
          {openingLine(reel.blocks) && (
            <p className="mt-2 max-w-prose text-[14px] italic leading-relaxed text-[color:var(--text-muted)]">
              «{openingLine(reel.blocks)}»
            </p>
          )}
        </div>

        {opts.canFocus && (
          <button
            type="button"
            onClick={() => setFocus((f) => !f)}
            aria-label={focus ? 'Згорнути' : 'На весь екран'}
            title={focus ? 'Згорнути' : 'На весь екран'}
            data-testid="shared-focus"
            className="app-icon-btn shrink-0"
          >
            {focus ? (
              <Minimize2 className="h-[18px] w-[18px]" strokeWidth={1.9} />
            ) : (
              <Maximize2 className="h-[18px] w-[18px]" strokeWidth={1.9} />
            )}
          </button>
        )}
      </header>

      {reel.blocks.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-[color:var(--border)] px-6 py-12 text-center text-[14px] text-[color:var(--text-muted)]">
          Цей рілс ще порожній.
        </p>
      ) : (
        <ReelRecipe
          blocks={reel.blocks}
          done={done}
          onToggleDone={toggle}
          reelAudio={reelAudioOf(reel)}
          overview={reel.overview}
          references={reel.references}
        />
      )}
    </>
  );

  const heading = (
    <header className="mb-6">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
        <Clapperboard className="h-3.5 w-3.5" strokeWidth={2.2} />
        {reels.length} {reels.length === 1 ? 'рілс' : 'рілсів'}
      </p>
      <h1 className="mt-1 break-words text-[26px] font-bold leading-tight tracking-tight text-[color:var(--foreground)]">
        {title?.trim() || 'Рілси на зйомку'}
      </h1>
      <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-[color:var(--text-muted)]">
        Обери рілс зліва. Для кожного видно, як він іде — що кажеш, що на екрані,
        що робить монтаж — і що треба зняти чи знайти. Познач галочкою, коли зроблено.
      </p>
      {note?.trim() ? (
        <p className="mt-2 max-w-prose whitespace-pre-wrap text-[14px] leading-relaxed text-[color:var(--text-muted)]">
          {note}
        </p>
      ) : null}
    </header>
  );

  // ── One reel, or focus mode: the recipe owns the page ────────────────────
  if (single || focus) {
    const reel = shown;
    return (
      <div className="min-h-[100dvh]" style={{ background: 'var(--canvas)' }}>
        <div className="mx-auto w-full max-w-[900px] px-4 pb-20 pt-6 md:px-8">
          {!single && (
            <button
              type="button"
              onClick={() => setFocus(false)}
              data-testid="shared-back"
              className="mb-4 flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--foreground)]"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
              Усі рілси ({reels.length})
            </button>
          )}
          {reel ? renderDetail(reel, { canFocus: !single }) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh]" style={{ background: 'var(--canvas)' }}>
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-20 pt-6 md:px-8">
        {/* ── Narrow: list, then detail with a way back ── */}
        <div className="lg:hidden">
          {openNarrow ? (
            <>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                data-testid="shared-back"
                className="mb-4 flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--foreground)]"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
                Усі рілси ({reels.length})
              </button>
              {renderDetail(openNarrow, { canFocus: false })}
            </>
          ) : (
            <>
              {heading}
              <ol className="flex flex-col gap-2.5">
                {rows.map((row) => (
                  <li key={row.reel.id}>{renderRow(row, { compact: false })}</li>
                ))}
              </ol>
            </>
          )}
        </div>

        {/* ── Wide: both at once ── */}
        <div className="hidden lg:block">
          {heading}
          <div className="grid grid-cols-[minmax(300px,34%)_1fr] items-start gap-6">
            {/* The list stays put while the recipe scrolls — you are working
                down one reel, not scrolling the batch away. */}
            <ol
              className="sticky top-6 flex max-h-[calc(100dvh-8rem)] flex-col gap-2 overflow-y-auto pr-1"
              data-testid="shared-reel-list"
            >
              {rows.map((row) => (
                <li key={row.reel.id}>{renderRow(row, { compact: true })}</li>
              ))}
            </ol>

            <div className="min-w-0" data-testid="shared-reel-detail">
              {shown ? renderDetail(shown, { canFocus: true }) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
