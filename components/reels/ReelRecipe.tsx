'use client';

import { Camera, Check, Clapperboard, Link2, Search } from 'lucide-react';
import CopyTextButton from '@/components/reels/CopyTextButton';
import {
  ASSET_LABELS,
  AUDIO_LABELS,
  BLOCK_COLORS,
  BLOCK_LABELS,
  editItemsForBlock,
  editKey,
  editList,
  isBlockEmpty,
  shotGroups,
  shotList,
  spokenScript,
  textRuns,
  type AudioSource,
  type ReelBlock,
} from '@/lib/reels/blocks';

/**
 * A reel read as the two jobs that follow writing it: what to capture, and what
 * to do with it afterwards.
 *
 * The SAME component renders the builder's «Що знімаємо» / «Монтаж» tabs and the
 * client's shared page. That is deliberate — the whole promise of the share link
 * is that the client sees exactly what the author sees, and two components
 * rendering one list is how they quietly stop agreeing.
 *
 * Everything here is derived from the blocks by `shotList` / `editList`; nothing
 * is stored, so a shot list cannot go stale against the script it came from.
 */

export default function ReelRecipe({
  blocks,
  only,
  done,
  onToggleDone,
  reelAudio,
}: {
  blocks: ReelBlock[];
  /** Restrict to one section (the builder's tabs); omit to show all three. */
  only?: 'shoot' | 'edit' | 'script';
  /**
   * Keys already ticked. Passing this WITHOUT `onToggleDone` is the builder's
   * case: she sees what the blogger has recorded, read-only.
   */
  done?: ReadonlySet<string>;
  onToggleDone?: (key: string, next: boolean) => void;
  /** The reel's own sound — stated once instead of on every block. */
  reelAudio?: AudioSource | null;
}) {
  const groups = shotGroups(blocks);
  const shots = shotList(blocks);
  const edits = editList(blocks, reelAudio);
  const script = spokenScript(blocks);

  const show = (section: 'shoot' | 'edit' | 'script') => !only || only === section;

  return (
    <div className="flex flex-col gap-6">
      {show('shoot') && (
        <section data-testid="recipe-shoot">
          <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            <Camera className="h-3.5 w-3.5" strokeWidth={2.2} />
            Що знімаємо
          </h2>

          {shots.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-[color:var(--border)] px-4 py-6 text-center text-[13px] text-[color:var(--text-muted)]">
              Тут поки нічого знімати.
            </p>
          ) : (
            /* Grouped by TYPE of work, not by reel order: you sit down once and
               say the whole text, then you go and collect the cutaways. Walking
               down the reel would send you back and forth between the two. */
            <div className="flex flex-col gap-5">
              {groups.map((g) => (
                <div key={g.id} data-testid="shot-group" data-group={g.id}>
                  <h3 className="mb-1.5 flex items-center gap-2 text-[12.5px] font-bold text-[color:var(--foreground)]">
                    {g.title}
                    <span className="text-[11.5px] font-semibold text-[color:var(--text-muted)]">
                      {g.items.length}
                    </span>
                  </h3>

                  <ol className="flex flex-col gap-2">
                    {g.items.map((s, i) => {
                      const isDone = s.keys.length > 0 && s.keys.every((k) => done?.has(k) ?? false);
                      return (
                        <li
                          key={s.keys[0] ?? i}
                          data-testid="shot-item"
                          data-done={isDone ? 'true' : 'false'}
                          className="flex items-start gap-3 rounded-[14px] border border-[color:var(--border)] bg-[color:var(--background)] p-3.5 transition-opacity"
                          style={{ boxShadow: 'var(--elev-1)', opacity: isDone ? 0.55 : 1 }}
                        >
                          {/* Ticking exists only where a handler was given — the
                              builder shows the same list without it, since the
                              person writing the reel is not the person crossing
                              shots off. A merged row ticks all its takes. */}
                          {onToggleDone ? (
                            <button
                              type="button"
                              onClick={() => s.keys.forEach((k) => onToggleDone(k, !isDone))}
                              aria-pressed={isDone}
                              aria-label={isDone ? 'Зняти позначку' : 'Позначити як знято'}
                              data-testid="shot-done"
                              className="mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[7px] border-2 transition-colors"
                              style={{
                                borderColor: isDone ? BLOCK_COLORS[s.kind] : 'var(--border-strong)',
                                backgroundColor: isDone ? BLOCK_COLORS[s.kind] : 'transparent',
                              }}
                            >
                              {isDone && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                            </button>
                          ) : (
                            <span
                              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-bold tabular-nums text-white"
                              style={{ backgroundColor: BLOCK_COLORS[s.kind] }}
                            >
                              {s.at ?? s.keys.length}
                            </span>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              {s.action && (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                                  style={{
                                    backgroundColor:
                                      s.action === 'film' || s.action === 'photo' ? '#0F8A6A1A' : '#C08C281A',
                                    color: s.action === 'film' || s.action === 'photo' ? '#0F8A6A' : '#8A6410',
                                  }}
                                >
                                  {ASSET_LABELS[s.action]}
                                </span>
                              )}
                              <span
                                className="text-[14.5px] font-semibold leading-snug text-[color:var(--foreground)]"
                                style={{ textDecoration: isDone ? 'line-through' : undefined }}
                              >
                                {s.what}
                              </span>
                            </div>

                            {/* Where the cutaway lands, in her own words — the
                                only cue anyone has before there is a timeline. */}
                            {s.cue && (
                              <p className="mt-1 text-[12.5px] italic leading-snug text-[color:var(--text-muted)]">
                                на «{s.cue}»
                              </p>
                            )}

                            {/* What has to fit on screen over this shot. */}
                            {s.screen && (
                              <p className="mt-1 text-[12.5px] leading-snug text-[color:var(--text-muted)]">
                                напис: «{s.screen}»
                              </p>
                            )}

                            {/* The words said during the shot travel WITH it —
                                you film with the line in hand. */}
                            {s.saying && (
                              <>
                                <p
                                  className="mt-1.5 whitespace-pre-wrap border-l-2 pl-2.5 text-[13.5px] leading-relaxed text-[color:var(--foreground)]"
                                  style={{ borderColor: 'var(--border-strong)' }}
                                >
                                  {s.saying}
                                </p>
                                <div className="mt-2">
                                  <CopyTextButton text={s.saying} label="Копіювати текст" />
                                </div>
                              </>
                            )}

                            {s.url && (
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--accent)] hover:underline"
                              >
                                <Link2 className="h-3.5 w-3.5" />
                                Референс
                              </a>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {show('script') && script && (
        <section data-testid="recipe-script">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              <Search className="h-3.5 w-3.5" strokeWidth={2.2} />
              Текст
            </h2>
            {/* Straight into the teleprompter — that is where this text is read. */}
            <CopyTextButton text={script} label="Копіювати для суфлера" />
          </div>
          <div
            className="whitespace-pre-wrap rounded-[14px] border border-[color:var(--border)] bg-[color:var(--background)] p-4 text-[15px] leading-relaxed text-[color:var(--foreground)]"
            style={{ boxShadow: 'var(--elev-1)' }}
          >
            {script}
          </div>
        </section>
      )}

      {show('edit') && (
        <section data-testid="recipe-edit">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              <Clapperboard className="h-3.5 w-3.5" strokeWidth={2.2} />
              Монтаж
            </h2>
            {/* The reel's sound, said ONCE. Repeating it under every block read
                as eight separate cues for what is one decision. */}
            {reelAudio && (
              <span
                className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                style={{ backgroundColor: 'var(--surface1)', color: 'var(--text-muted)' }}
                data-testid="reel-audio-note"
              >
                Весь рілс: {AUDIO_LABELS[reelAudio].toLowerCase()}
              </span>
            )}
          </div>

          {edits.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-[color:var(--border)] px-4 py-6 text-center text-[13px] text-[color:var(--text-muted)]">
              Окремих вказівок для монтажу немає — просто збери по порядку.
            </p>
          ) : (
            /* Read down the SCRIPT, not down a task list: the words, then what
               happens over them. An editor works to what is being said — a
               column of instructions detached from the text is a puzzle. */
            <ol className="flex flex-col gap-3">
              {blocks.map((b, i) => {
                if (isBlockEmpty(b)) return null;
                const items = editItemsForBlock(b, i + 1, reelAudio);
                const body = (b.spoken ?? b.screenText ?? '').trim();
                if (items.length === 0 && !body) return null;
                const runs = textRuns(body, b.overlays);
                const color = BLOCK_COLORS[b.kind];

                return (
                  <li
                    key={b.id}
                    data-testid="edit-block"
                    className="rounded-[14px] border border-[color:var(--border)] bg-[color:var(--background)] p-3.5"
                    style={{ boxShadow: 'var(--elev-1)' }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-[10.5px] font-bold tabular-nums text-white"
                        style={{ backgroundColor: color }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                        {BLOCK_LABELS[b.kind]}
                      </span>
                    </div>

                    {/* The words, with the anchored phrases marked — so «коли
                        кажу оце» is visible rather than described. */}
                    {body && (
                      <p className="mb-2.5 whitespace-pre-wrap text-[14.5px] leading-relaxed text-[color:var(--foreground)]">
                        {runs.map((run, ri) =>
                          run.overlayIds.length > 0 ? (
                            <mark
                              key={ri}
                              className="rounded-[3px]"
                              style={{
                                backgroundColor: `${color}24`,
                                boxShadow: `inset 0 -2px 0 ${color}`,
                                color: 'inherit',
                              }}
                            >
                              {run.text}
                            </mark>
                          ) : (
                            <span key={ri}>{run.text}</span>
                          ),
                        )}
                      </p>
                    )}

                    <ul className="flex flex-col gap-1.5">
                      {items.map((e) => {
                        const key = editKey(e);
                        const isDone = done?.has(key) ?? false;
                        return (
                          <li
                            key={key}
                            data-testid="edit-item"
                            data-done={isDone ? 'true' : 'false'}
                            className="flex items-start gap-2.5 rounded-[10px] bg-[color:var(--surface1)]/70 px-3 py-2 transition-opacity"
                            style={{ opacity: isDone ? 0.55 : 1 }}
                          >
                            {onToggleDone ? (
                              <button
                                type="button"
                                onClick={() => onToggleDone(key, !isDone)}
                                aria-pressed={isDone}
                                aria-label={isDone ? 'Зняти позначку' : 'Позначити як зроблено'}
                                data-testid="edit-done"
                                className="mt-px flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-2 transition-colors"
                                style={{
                                  borderColor: isDone ? '#0F8A6A' : 'var(--border-strong)',
                                  backgroundColor: isDone ? '#0F8A6A' : 'transparent',
                                }}
                              >
                                {isDone && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                              </button>
                            ) : (
                              <span
                                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: 'var(--border-strong)' }}
                              />
                            )}
                            <span className="min-w-0 flex-1">
                              <span
                                className="text-[13.5px] leading-relaxed text-[color:var(--foreground)]"
                                style={{ textDecoration: isDone ? 'line-through' : undefined }}
                              >
                                {e.what}
                              </span>
                              {e.url && (
                                <a
                                  href={e.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-2 inline-flex items-center gap-1 align-middle text-[12.5px] font-medium text-[color:var(--accent)] hover:underline"
                                >
                                  <Link2 className="h-3.5 w-3.5" />
                                  Референс
                                </a>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      {!only && blocks.length > 0 && (
        <p className="text-[12px] text-[color:var(--text-muted)]">
          {blocks.length} {blocks.length === 1 ? 'блок' : 'блоків'} ·{' '}
          {BLOCK_LABELS[blocks[0].kind].toLowerCase()} на початку
        </p>
      )}
    </div>
  );
}
