'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, Copy, ExternalLink, Share2, X } from 'lucide-react';
import {
  createReelShareLinkAction,
  regenerateReelShareLinkAction,
  revokeReelShareLinkAction,
} from '@/app/reel-block-actions';

/**
 * «Поділитися» on a reel — the link you send to whoever is shooting it.
 *
 * What opens on the other end is the recipe, not the builder: що знімаємо, the
 * text word for word, and what the editor does. It is live, so a block rewritten
 * after the link was sent is what they see when they open it.
 */
export default function ReelShareButton({
  reelId,
  initialToken,
}: {
  reelId: string;
  initialToken: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(initialToken);
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

  const create = () =>
    startTransition(async () => {
      const res = await createReelShareLinkAction(reelId);
      if (res.ok) setToken(res.token);
      else setError('Не вдалося створити посилання.');
    });

  const regenerate = () => {
    if (!window.confirm('Нове посилання? Старе перестане працювати.')) return;
    setCopied(false);
    startTransition(async () => {
      const res = await regenerateReelShareLinkAction(reelId);
      if (res.ok) setToken(res.token);
    });
  };

  const revoke = () => {
    if (!window.confirm('Вимкнути посилання?')) return;
    startTransition(async () => {
      await revokeReelShareLinkAction(reelId);
      setToken(null);
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="reel-share-trigger"
        aria-label="Поділитися рілсом"
        title="Поділитися рілсом"
        className="app-icon-btn"
      >
        <Share2 className="h-4 w-4" strokeWidth={1.9} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Закрити"
            onClick={() => setOpen(false)}
          />
          <div
            className="relative z-[91] w-full max-w-lg rounded-[22px] bg-[color:var(--background)] p-5 shadow-[var(--elev-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[19px] font-bold tracking-tight text-[color:var(--foreground)]">
                  Поділитися рілсом
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--text-muted)]">
                  Відкриється список — що знімати, текст слово в слово і що робити на монтажі.
                  Без входу, змінити нічого не можна.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрити" className="app-icon-btn shrink-0">
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>

            {!token ? (
              <button
                type="button"
                onClick={create}
                disabled={pending}
                data-testid="reel-share-create"
                className="app-btn-primary w-full disabled:opacity-60"
              >
                {pending ? '…' : 'Створити посилання'}
              </button>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={url}
                    data-testid="reel-share-url"
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface1)] px-3 py-2.5 text-[13px] text-[color:var(--foreground)]"
                  />
                  <button type="button" onClick={copy} aria-label="Копіювати" className="app-icon-btn shrink-0">
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
                    aria-label="Відкрити"
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
                    className="rounded-[12px] border border-[color:var(--border)] px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[color:var(--surface1)] disabled:opacity-60"
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
