'use client';

import { useState } from 'react';
import { Link as LinkIcon, Sparkles, Check } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
import { savePostedLink } from '@/app/posted-actions';
import { tierProgress, remainingLabel } from '@/lib/insights/postedLink';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * The link-capture pop-up (Prompt 2) — the single biggest behaviour driver in
 * the loop, because it is what makes handing over a link feel worth doing.
 *
 * Opens automatically the moment a piece flips to Опубліковано, every time.
 * Asking is the default; dismissing costs nothing and destroys nothing — the
 * piece stays published, just without a link, and it can be added later from
 * the gamification page.
 *
 * Three things and no more: the field, ONE warm line saying why, and a real
 * number of posts to the next reward. The number is derived from the user's
 * actual count, so it cannot flatter them.
 */
export default function PostedLinkSheet({
  open,
  onClose,
  refTable,
  id,
  /** Current submission count, for the motivating line. */
  count,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  refTable: ContentPiece['refTable'];
  id: string;
  count: number;
  onSaved?: (nextCount: number) => void;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const progress = tierProgress(count);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await savePostedLink(refTable, id, url);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
    onSaved?.(res.count);
    window.setTimeout(onClose, 900);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Опубліковано! 🎉">
      {done ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--success)]/12">
            <Check className="h-6 w-6 text-[color:var(--success)]" strokeWidth={2.6} />
          </span>
          <p className="text-[15px] font-semibold text-[color:var(--foreground)]">Записала</p>
        </div>
      ) : (
        <>
          {/* The one warm line. Not a disclaimer — the reason she'd want to. */}
          <p className="px-1 pb-3 text-[13.5px] leading-relaxed text-[color:var(--text-secondary)]">
            Кинь посилання — і я підтягну, як цей пост зайшов. З цього збирається твоя
            статистика і наступні ідеї.
          </p>

          <label className="relative block">
            <LinkIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-muted)]"
              aria-hidden
            />
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
              placeholder="instagram.com/p/…"
              aria-label="Посилання на пост"
              data-testid="posted-link-input"
              className="w-full rounded-[12px] border border-[color:var(--border)] bg-white py-3 pl-9 pr-3 text-[15px] text-[color:var(--foreground)] outline-none focus:border-[color:var(--accent)]"
            />
          </label>

          {error ? (
            <p role="alert" className="mt-2 px-1 text-[13px] text-[color:var(--text-secondary)]">
              {error}
            </p>
          ) : null}

          {/* A real number, derived from her actual count. */}
          <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-[color:var(--accent-soft)] px-3.5 py-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-[color:var(--accent)]" strokeWidth={2.2} />
            <span
              data-testid="posted-link-progress"
              className="text-[13px] font-semibold text-[color:var(--accent)]"
            >
              {remainingLabel(progress)}
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-2 pb-1">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || url.trim().length === 0}
              data-testid="posted-link-save"
              className="app-btn-primary w-full"
            >
              {busy ? 'Зберігаю…' : 'Додати посилання'}
            </button>
            {/* Dismissing is safe and says so — the piece stays published. */}
            <button
              type="button"
              onClick={onClose}
              data-testid="posted-link-skip"
              className="w-full rounded-full py-2.5 text-[13px] font-medium text-[color:var(--text-muted)]"
            >
              Пізніше
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
