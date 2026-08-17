'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, Copy, ExternalLink, Share2, X } from 'lucide-react';
import {
  createCalendarShareLinkAction,
  regenerateCalendarShareLinkAction,
  revokeCalendarShareLinkAction,
  updateCalendarShareHeaderAction,
} from '@/app/plan/actions';
import type { CalendarShareLink } from '@/lib/calendar/sharedCalendar';

/**
 * «Поділитися» on План — one link that opens this calendar for a client, with no
 * login and nothing they can change.
 *
* The link is LIVE, not an export: whatever gets planned after it is sent shows
 * up on the same URL, which is the whole reason it is a link rather than a PDF.
 *
 * One link per BLOGGER (migration 032), not per account: under Pro this page is
 * already showing one blogger's plan, and the link shows exactly that. Pressing
 * the button twice must not mint a second URL to keep track of, so it returns
 * the existing one; regenerating replaces it (the old one dies), revoking turns
 * it off — all scoped to the blogger on screen.
 */
export default function CalendarShareButton({
  initialLink,
  canShare = true,
  defaultTitle,
}: {
  initialLink: CalendarShareLink | null;
  /**
   * False in Pro's "All bloggers" view. A link shows ONE blogger's plan, so
   * there is nothing to create until the switcher is pinned to one — offering
   * the button anyway is how a client ends up holding every client's calendar.
   */
  canShare?: boolean;
  /** Falls back into the header the client sees, when the owner sets none. */
  defaultTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<CalendarShareLink | null>(initialLink);
  const [title, setTitle] = useState(initialLink?.title ?? defaultTitle);
  const [note, setNote] = useState(initialLink?.note ?? '');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const url = link && typeof window !== 'undefined' ? `${window.location.origin}/share/calendar/${link.token}` : '';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const create = () => {
    setError(null);
    startTransition(async () => {
      const res = await createCalendarShareLinkAction(title);
      if (res.ok) setLink(res.link);
      else setError(res.error);
    });
  };

  const regenerate = () => {
    if (!window.confirm('Створити нове посилання? Старе перестане працювати.')) return;
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const res = await regenerateCalendarShareLinkAction(title);
      if (res.ok) setLink(res.link);
      else setError(res.error);
    });
  };

  const revoke = () => {
    if (!window.confirm('Вимкнути посилання? Клієнт більше не зможе його відкрити.')) return;
    startTransition(async () => {
      await revokeCalendarShareLinkAction();
      setLink(null);
      setCopied(false);
    });
  };

  const saveHeader = () => {
    if (!link) return;
    startTransition(async () => {
      await updateCalendarShareHeaderAction(title, note);
    });
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Не вдалося скопіювати. Скопіюй посилання вручну.');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="calendar-share-trigger"
        aria-label="Поділитися календарем"
        title="Поділитися календарем"
        className="app-icon-btn"
      >
        <Share2 className="h-4 w-4" strokeWidth={1.9} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-share-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Закрити"
            onClick={() => setOpen(false)}
          />
          <div
            className="relative z-[91] max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[22px] bg-[color:var(--background)] p-5 shadow-[var(--elev-3)] sm:rounded-[22px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="calendar-share-title"
                  className="text-[19px] font-bold tracking-tight text-[color:var(--foreground)]"
                >
                  Поділитися календарем
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--text-muted)]">
                  {canShare ? (
                    <>
                      План <span className="font-semibold text-[color:var(--foreground)]">{defaultTitle}</span>{' '}
                      — і тільки його. Клієнт відкриває без входу й нічого не змінює.
                    </>
                  ) : (
                    'Клієнт бачить те, що заплановано, і може відкрити будь-який контент — без входу й без права щось змінити.'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрити"
                className="app-icon-btn shrink-0"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>

            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Заголовок для клієнта
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveHeader}
              maxLength={80}
              data-testid="calendar-share-title-input"
              className="mb-3 w-full rounded-[12px] border border-[color:var(--border)] bg-white px-3 py-2.5 text-[14px] text-[color:var(--foreground)] outline-none focus:border-[color:var(--border-strong)]"
            />

            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Примітка (не обов’язково)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveHeader}
              rows={2}
              maxLength={280}
              placeholder="Напр.: план на серпень, пиши, якщо щось хочеш змінити"
              className="mb-4 w-full resize-none rounded-[12px] border border-[color:var(--border)] bg-white px-3 py-2.5 text-[14px] text-[color:var(--foreground)] outline-none focus:border-[color:var(--border-strong)]"
            />

            {!canShare ? (
              <p
                data-testid="calendar-share-pick-blogger"
                className="rounded-[12px] border border-dashed border-[color:var(--border)] px-4 py-5 text-center text-[13px] leading-relaxed text-[color:var(--text-muted)]"
              >
                Посилання створюється для одного блогера. Обери блогера у верхньому перемикачі —
                і клієнт побачить тільки його план.
              </p>
            ) : !link ? (
              <button
                type="button"
                onClick={create}
                disabled={pending}
                data-testid="calendar-share-create"
                className="app-btn-primary w-full disabled:opacity-60"
              >
                {pending ? '…' : 'Створити посилання'}
              </button>
            ) : (
              <>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                  Посилання (тільки перегляд)
                </label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={url}
                    data-testid="calendar-share-url"
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface1)] px-3 py-2.5 text-[13px] text-[color:var(--foreground)]"
                  />
                  <button
                    type="button"
                    onClick={copy}
                    aria-label="Копіювати посилання"
                    className="app-icon-btn shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.4} />
                    ) : (
                      <Copy className="h-4 w-4" strokeWidth={1.8} />
                    )}
                  </button>
                  <a
                    href={url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Відкрити як клієнт"
                    className="app-icon-btn shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
                  </a>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={regenerate}
                    disabled={pending}
                    className="rounded-[12px] border border-[color:var(--border)] px-3 py-2 text-[13px] font-medium text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--surface1)] disabled:opacity-60"
                  >
                    Нове посилання
                  </button>
                  <button
                    type="button"
                    onClick={revoke}
                    disabled={pending}
                    className="rounded-[12px] border border-[color:var(--border)] px-3 py-2 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                  >
                    Вимкнути
                  </button>
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
