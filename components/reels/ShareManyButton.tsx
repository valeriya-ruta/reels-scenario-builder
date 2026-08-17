'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Check, Copy, ExternalLink, Share2, X } from 'lucide-react';
import { createReelSetShareLinkAction } from '@/app/reel-block-actions';
import { displayTitle } from '@/lib/content/displayTitle';
import { dayHeaderLabel } from '@/lib/content/calendar';

/**
 * «Поділитися кількома» — fifteen prepared reels as ONE link.
 *
 * Sending fifteen separate URLs is fifteen things for both people to keep track
 * of, so this picks a set and mints one. Deliberately a picker rather than
 * checkboxes bolted onto the reel list: that list is shared with three other
 * content types, and sharing is a rare, deliberate act, not a mode the list
 * should always be in.
 */

export type PickableReel = {
  id: string;
  name: string | null;
  scheduledDate: string | null;
};

export default function ShareManyButton({ reels }: { reels: PickableReel[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const url = token && typeof window !== 'undefined' ? `${window.location.origin}/share/reel/${token}` : '';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const ordered = useMemo(() => reels.filter((r) => picked.has(r.id)).map((r) => r.id), [reels, picked]);
  const allPicked = reels.length > 0 && ordered.length === reels.length;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = () => {
    setError(null);
    startTransition(async () => {
      const res = await createReelSetShareLinkAction(ordered, title.trim() || null);
      if (res.ok) setToken(res.token);
      else setError('Не вдалося створити посилання.');
    });
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Не вдалося скопіювати.');
    }
  };

  const reset = () => {
    setOpen(false);
    setToken(null);
    setPicked(new Set());
    setTitle('');
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="share-many-trigger"
        className="flex cursor-pointer items-center gap-2 rounded-[12px] border border-[color:var(--border)] px-3 py-2 text-[13px] font-semibold text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--surface1)]"
      >
        <Share2 className="h-4 w-4" strokeWidth={1.9} />
        Поділитися кількома
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Закрити" onClick={reset} />
          <div
            className="relative z-[91] flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-[22px] bg-[color:var(--background)] p-5 shadow-[var(--elev-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[19px] font-bold tracking-tight text-[color:var(--foreground)]">
                  Поділитися кількома рілсами
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--text-muted)]">
                  Одне посилання на всі обрані. Вона відкриє список, зайде в кожен і позначатиме,
                  що вже зняла — ти бачитимеш це в себе.
                </p>
              </div>
              <button type="button" onClick={reset} aria-label="Закрити" className="app-icon-btn shrink-0">
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>

            {!token ? (
              <>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder="Назва для неї — напр. «Зйомка на вересень»"
                  data-testid="share-many-title"
                  className="mb-3 w-full rounded-[12px] border border-[color:var(--border)] bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[color:var(--border-strong)]"
                />

                {/* Sharing everything prepared is the common case — fifteen
                    taps to say "all of them" is the wrong default. */}
                {reels.length > 1 && (
                  <div className="mb-2 flex items-center justify-between px-0.5">
                    <span className="text-[12px] text-[color:var(--text-muted)]">
                      Обрано {picked.size} з {reels.length}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPicked(allPicked ? new Set() : new Set(reels.map((r) => r.id)))
                      }
                      data-testid="share-many-all"
                      className="cursor-pointer text-[12.5px] font-semibold text-[color:var(--accent)] hover:underline"
                    >
                      {allPicked ? 'Зняти всі' : 'Обрати всі'}
                    </button>
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto rounded-[14px] border border-[color:var(--border)]">
                  {reels.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[13px] text-[color:var(--text-muted)]">
                      Ще немає рілсів.
                    </p>
                  ) : (
                    reels.map((r) => {
                      const on = picked.has(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => toggle(r.id)}
                          data-testid="share-many-row"
                          data-picked={on ? 'true' : 'false'}
                          className="flex w-full cursor-pointer items-center gap-3 border-b border-[color:var(--border)] px-3.5 py-2.5 text-left last:border-b-0 transition-colors hover:bg-[color:var(--surface1)]"
                        >
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors"
                            style={{
                              borderColor: on ? 'var(--accent)' : 'var(--border-strong)',
                              backgroundColor: on ? 'var(--accent)' : 'transparent',
                            }}
                          >
                            {on && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[color:var(--foreground)]">
                            {displayTitle(r.name, 'reel')}
                          </span>
                          {r.scheduledDate && (
                            <span className="shrink-0 text-[12px] text-[color:var(--text-muted)]">
                              {dayHeaderLabel(r.scheduledDate)}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                <button
                  type="button"
                  onClick={create}
                  disabled={pending || picked.size === 0}
                  data-testid="share-many-create"
                  className="app-btn-primary mt-4 w-full disabled:opacity-50"
                >
                  {pending
                    ? '…'
                    : picked.size === 0
                      ? 'Обери рілси'
                      : `Створити посилання на ${picked.size}`}
                </button>
              </>
            ) : (
              <>
                <p className="mb-2 text-[13px] font-medium text-[color:var(--foreground)]">
                  Готово — {ordered.length} {ordered.length === 1 ? 'рілс' : 'рілсів'} за одним посиланням.
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={url}
                    data-testid="share-many-url"
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface1)] px-3 py-2.5 text-[13px]"
                  />
                  <button type="button" onClick={copy} aria-label="Копіювати" className="app-icon-btn shrink-0">
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.4} />
                    ) : (
                      <Copy className="h-4 w-4" strokeWidth={1.8} />
                    )}
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Відкрити"
                    className="app-icon-btn shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
                  </a>
                </div>
              </>
            )}

            {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
