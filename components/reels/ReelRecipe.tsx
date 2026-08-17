'use client';

import { Camera, Check, Clapperboard, Link2, Search } from 'lucide-react';
import {
  ASSET_LABELS,
  BLOCK_COLORS,
  BLOCK_LABELS,
  editKey,
  editList,
  shotKey,
  shotList,
  spokenScript,
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
}) {
  const shots = shotList(blocks);
  const edits = editList(blocks);
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
            <ol className="flex flex-col gap-2">
              {shots.map((s, i) => {
                const key = shotKey(s);
                const isDone = done?.has(key) ?? false;
                return (
                <li
                  key={i}
                  data-testid="shot-item"
                  data-done={isDone ? 'true' : 'false'}
                  className="flex items-start gap-3 rounded-[14px] border border-[color:var(--border)] bg-[color:var(--background)] p-3.5 transition-opacity"
                  style={{ boxShadow: 'var(--elev-1)', opacity: isDone ? 0.55 : 1 }}
                >
                  {/* Ticking exists only where a handler was given — the builder
                      shows the same list without it, since the person writing
                      the reel is not the person crossing shots off. */}
                  {onToggleDone ? (
                    <button
                      type="button"
                      onClick={() => onToggleDone(key, !isDone)}
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
                      {s.at}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {s.action && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                          style={{
                            backgroundColor: s.action === 'film' || s.action === 'photo' ? '#0F8A6A1A' : '#C08C281A',
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

                    {/* The words said during the shot travel WITH it — you film
                        with the line in hand, not by cross-referencing. */}
                    {s.saying && (
                      <p className="mt-1.5 whitespace-pre-wrap border-l-2 pl-2.5 text-[13.5px] leading-relaxed text-[color:var(--foreground)]"
                         style={{ borderColor: 'var(--border-strong)' }}>
                        {s.saying}
                      </p>
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
          )}
        </section>
      )}

      {show('script') && script && (
        <section data-testid="recipe-script">
          <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            <Search className="h-3.5 w-3.5" strokeWidth={2.2} />
            Текст
          </h2>
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
          <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            <Clapperboard className="h-3.5 w-3.5" strokeWidth={2.2} />
            Монтаж
          </h2>

          {edits.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-[color:var(--border)] px-4 py-6 text-center text-[13px] text-[color:var(--text-muted)]">
              Окремих вказівок для монтажу немає — просто збери по порядку.
            </p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {edits.map((e, i) => {
                const key = editKey(e);
                const isDone = done?.has(key) ?? false;
                return (
                  <li
                    key={i}
                    data-testid="edit-item"
                    data-done={isDone ? 'true' : 'false'}
                    className="flex items-start gap-3 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface1)]/60 px-3.5 py-2.5 transition-opacity"
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
                      <span className="mt-px shrink-0 text-[11px] font-bold tabular-nums text-[color:var(--text-muted)]">
                        {e.at}
                      </span>
                    )}
                    <span
                      className="text-[13.5px] leading-relaxed text-[color:var(--foreground)]"
                      style={{ textDecoration: isDone ? 'line-through' : undefined }}
                    >
                      {e.what}
                    </span>
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
