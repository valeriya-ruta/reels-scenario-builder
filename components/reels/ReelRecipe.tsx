'use client';

import { Camera, Check, Clapperboard, Lightbulb, Search } from 'lucide-react';
import CopyTextButton from '@/components/reels/CopyTextButton';
import ReferenceMedia from '@/components/reels/ReferenceMedia';
import {
  ASSET_LABELS,
  AUDIO_LABELS,
  BLOCK_COLORS,
  BLOCK_LABELS,
  editItemsForBlock,
  editKey,
  flowBeats,
  shotGroups,
  shotList,
  spokenScript,
  textRuns,
  type AudioSource,
  type ReelBlock,
  type RefImage,
} from '@/lib/reels/blocks';

/**
 * A reel, for everyone who did not write it.
 *
 * «Як іде рілс» comes first and is three columns wide: what is SAID, what is
 * SEEN, what the editor DOES — one row per beat. Read across, a row is a
 * sentence; read down, the columns are the whole reel. Opening on the shot list
 * instead, as this page used to, hands someone six «знайти» rows and no idea
 * what they are for.
 *
 * «Що знімаємо» follows, grouped by type of work, because collecting material
 * is a different job from understanding the reel and is done in a different
 * order.
 *
 * The SAME component renders the builder's tabs and the client's shared page.
 * That is deliberate — the whole promise of the share link is that the client
 * sees exactly what the author sees, and two components rendering one list is
 * how they quietly stop agreeing.
 *
 * Everything is derived from the blocks; nothing is stored, so none of it can
 * go stale against the script it came from.
 */

export default function ReelRecipe({
  blocks,
  only,
  done,
  onToggleDone,
  reelAudio,
  overview,
  references,
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
  /** «Про що цей рілс» — the brief, read before the beats. */
  overview?: string | null;
  /** Reel-wide references, shown with the brief. */
  references?: RefImage[];
}) {
  const beats = flowBeats(blocks, reelAudio);
  const groups = shotGroups(blocks);
  const shots = shotList(blocks);
  const script = spokenScript(blocks);

  const show = (section: 'shoot' | 'edit' | 'script') => !only || only === section;

  return (
    <div className="flex flex-col gap-6">
      {show('edit') && (overview?.trim() || (references?.length ?? 0) > 0) ? (
        /* The idea, in the author's own words, before any of the mechanics. A
           beat-by-beat breakdown is precise and still does not tell you what
           the reel is FOR — which for a purely edited video is everything. */
        <section data-testid="recipe-overview">
          <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            <Lightbulb className="h-3.5 w-3.5" strokeWidth={2.2} />
            Про що цей рілс
          </h2>
          {overview?.trim() && (
            <p
              className="whitespace-pre-wrap rounded-[14px] border-l-[3px] bg-[color:var(--background)] px-4 py-3.5 text-[15px] leading-relaxed text-[color:var(--foreground)]"
              style={{ borderColor: 'var(--accent)', boxShadow: 'var(--elev-1)' }}
            >
              {overview.trim()}
            </p>
          )}

          {/* The references belong WITH the brief: «ось на що це схоже» is part
              of saying what the reel is, and both come before any mechanics. */}
          {(references?.length ?? 0) > 0 && (
            <div className="mt-2.5 flex flex-col gap-2" data-testid="recipe-references">
              {references!.map((r) => (
                <ReferenceMedia key={r.id} url={r.url} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {show('edit') && (
        <section data-testid="recipe-flow">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              <Clapperboard className="h-3.5 w-3.5" strokeWidth={2.2} />
              Як іде рілс
            </h2>
            <div className="flex items-center gap-2">
              {/* The reel's sound, said ONCE. Repeating it under every beat read
                  as many separate cues for what is one decision. */}
              {reelAudio && (
                <span
                  className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                  style={{ backgroundColor: 'var(--surface1)', color: 'var(--text-muted)' }}
                  data-testid="reel-audio-note"
                >
                  Весь рілс: {AUDIO_LABELS[reelAudio].toLowerCase()}
                </span>
              )}
              {script && <CopyTextButton text={script} label="Копіювати текст" />}
            </div>
          </div>

          {beats.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-[color:var(--border)] px-4 py-6 text-center text-[13px] text-[color:var(--text-muted)]">
              Цей рілс ще порожній.
            </p>
          ) : (
            <>
              {/* Three columns, one row per beat: what is SAID, what is SEEN,
                  what the editor DOES. Read left to right, a beat is a sentence;
                  read top to bottom, the three columns are the whole reel. This
                  is the answer to "what is this reel about", which neither the
                  shot list nor the edit list ever gave. */}
              <div className="mb-1.5 hidden grid-cols-[1.1fr_1fr_1fr] gap-3 px-3 md:grid">
                {['Що кажеш', 'Що на екрані', 'Що в монтажі'].map((h) => (
                  <span
                    key={h}
                    className="text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--text-muted)]"
                  >
                    {h}
                  </span>
                ))}
              </div>

              <ol className="flex flex-col gap-2">
                {beats.map((beat) => {
                  const b = blocks.find((x) => x.id === beat.blockId);
                  const items = b ? editItemsForBlock(b, beat.at, reelAudio) : [];
                  const runs = b ? textRuns(beat.saying, b.overlays) : [];
                  const color = BLOCK_COLORS[beat.kind];

                  return (
                    <li
                      key={beat.blockId}
                      data-testid="flow-beat"
                      className="rounded-[14px] border border-[color:var(--border)] bg-[color:var(--background)] p-3"
                      style={{ boxShadow: 'var(--elev-1)' }}
                    >
                      <div className="grid gap-3 md:grid-cols-[1.1fr_1fr_1fr]">
                        {/* ── what is said ── */}
                        <div className="min-w-0">
                          <div className="mb-1.5 flex items-center gap-2">
                            <span
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-[10.5px] font-bold tabular-nums text-white"
                              style={{ backgroundColor: color }}
                            >
                              {beat.at}
                            </span>
                            <span className="text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--text-muted)]">
                              {beat.label} · ~{beat.seconds}с
                            </span>
                          </div>

                          {beat.saying ? (
                            <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-[color:var(--foreground)]">
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
                          ) : (
                            <p className="text-[13px] italic text-[color:var(--text-muted)]">
                              нічого не кажеш
                            </p>
                          )}
                        </div>

                        {/* ── what is seen ── */}
                        <div className="min-w-0 md:border-l md:border-[color:var(--border)] md:pl-3">
                          <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--text-muted)] md:hidden">
                            Що на екрані
                          </p>
                          <ul className="flex flex-col gap-1">
                            {beat.onScreen.map((line, li) => (
                              <li
                                key={li}
                                className="text-[13.5px] leading-snug text-[color:var(--foreground)]"
                              >
                                {line}
                              </li>
                            ))}
                          </ul>
                          {beat.screenText.map((t, ti) => (
                            <p
                              key={ti}
                              className="mt-1.5 inline-block rounded-[6px] px-2 py-1 text-[12.5px] font-semibold"
                              style={{ backgroundColor: `${color}18`, color: 'var(--foreground)' }}
                            >
                              напис: «{t}»
                            </p>
                          ))}
                          {beat.audioDiffers && (
                            <p className="mt-1.5 text-[12px] text-[color:var(--text-muted)]">
                              звук: {AUDIO_LABELS[beat.audio].toLowerCase()}
                            </p>
                          )}

                          {/* Pasted references: showing the frame beats
                              describing it. */}
                          {beat.images.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {beat.images.map((src) => (
                                <ReferenceMedia key={src} url={src} compact />
                              ))}
                            </div>
                          )}
                          {beat.links.map((href) => (
                            <ReferenceMedia key={href} url={href} compact />
                          ))}
                        </div>

                        {/* ── what the editor does ── */}
                        <div className="min-w-0 md:border-l md:border-[color:var(--border)] md:pl-3">
                          <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--text-muted)] md:hidden">
                            Що в монтажі
                          </p>
                          {items.length === 0 ? (
                            <p className="text-[13px] italic text-[color:var(--text-muted)]">
                              нічого окремого
                            </p>
                          ) : (
                            <ul className="flex flex-col gap-1.5">
                              {items.map((e) => {
                                const key = editKey(e);
                                const isDone = done?.has(key) ?? false;
                                return (
                                  <li
                                    key={key}
                                    data-testid="edit-item"
                                    data-done={isDone ? 'true' : 'false'}
                                    className="flex items-start gap-2 transition-opacity"
                                    style={{ opacity: isDone ? 0.55 : 1 }}
                                  >
                                    {onToggleDone ? (
                                      <button
                                        type="button"
                                        onClick={() => onToggleDone(key, !isDone)}
                                        aria-pressed={isDone}
                                        aria-label={isDone ? 'Зняти позначку' : 'Позначити як зроблено'}
                                        data-testid="edit-done"
                                        className="mt-px flex h-4.5 w-4.5 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-2 transition-colors"
                                        style={{
                                          height: 18,
                                          width: 18,
                                          borderColor: isDone ? '#0F8A6A' : 'var(--border-strong)',
                                          backgroundColor: isDone ? '#0F8A6A' : 'transparent',
                                        }}
                                      >
                                        {isDone && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                                      </button>
                                    ) : (
                                      <span
                                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                                        style={{ backgroundColor: 'var(--border-strong)' }}
                                      />
                                    )}
                                    <span className="min-w-0 flex-1">
                                      <span
                                        className="text-[13px] leading-relaxed text-[color:var(--foreground)]"
                                        style={{ textDecoration: isDone ? 'line-through' : undefined }}
                                      >
                                        {e.what}
                                      </span>
                                      {e.url && <ReferenceMedia url={e.url} compact />}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </section>
      )}

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

                            {/* A reference is watched next to the shot list, not
                                in a tab you have to come back from. */}
                            <ReferenceMedia url={s.url} compact />
                            {s.image && <ReferenceMedia url={s.image} compact />}
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

      {only === 'script' && script && (
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

      {!only && blocks.length > 0 && (
        <p className="text-[12px] text-[color:var(--text-muted)]">
          {blocks.length} {blocks.length === 1 ? 'блок' : 'блоків'} ·{' '}
          {BLOCK_LABELS[blocks[0].kind].toLowerCase()} на початку
        </p>
      )}
    </div>
  );
}
