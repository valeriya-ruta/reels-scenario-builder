'use client';

import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
import { readReference, saveReelMeta } from '@/app/reel-actions';
import { isPlayable, resolveReference } from '@/lib/reels/referenceLink';

/**
 * The reel this one is modelled on.
 *
 * Its own sheet, reached from its own chip next to the status and the date.
 * It lived under ⋯ beside the caption, which made no sense in either
 * direction: a reference is an INPUT — the thing you have before you write —
 * and a caption is an OUTPUT, written once the script exists. Putting them in
 * one drawer meant hunting past the caption to find it, and she did, and gave
 * up.
 */
export default function ReferenceSheet({
  open,
  projectId,
  initialUrl,
  hasWriting,
  onClose,
  onText,
  onUrlChange,
}: {
  open: boolean;
  projectId: string;
  initialUrl: string | null;
  hasWriting: boolean;
  onClose: () => void;
  onText: (text: string) => void;
  onUrlChange: (url: string | null) => void;
}) {
  const [link, setLink] = useState(initialUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The transcript, held until she says what to do with it. */
  const [pending, setPending] = useState<string | null>(null);

  const persist = (next: string) => {
    onUrlChange(next.trim() || null);
    void saveReelMeta(projectId, { referenceUrl: next.trim() || null });
  };

  /**
   * Reading a reference NEVER overwrites silently.
   *
   * On an empty note its words simply become the note — there is nothing to
   * lose. With writing already on the page the transcript waits and she is
   * asked, because «розібрати» meaning «delete what I wrote» is the kind of
   * surprise that costs an evening.
   */
  const pull = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    persist(link);
    const res = await readReference(link);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (!hasWriting) {
      onText(res.data.text);
      onClose();
      return;
    }
    setPending(res.data.text);
  };

  const reference = resolveReference(link);

  return (
    <BottomSheet open={open} onClose={onClose} title="Референс">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-snug text-[color:var(--text-muted)]">
          Рілс, на який це схоже. Можу витягнути з нього текст — або просто лишити як
          орієнтир.
        </p>

        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onBlur={() => persist(link)}
          inputMode="url"
          autoFocus
          placeholder="https://instagram.com/reel/…"
          className="min-h-12 w-full rounded-[12px] border border-[color:var(--border)] bg-[color:var(--background)] px-3.5 text-[15px] text-[color:var(--foreground)] placeholder-[color:var(--text-muted)] outline-none focus:border-[color:var(--accent)]"
        />

        {isPlayable(reference) && reference ? (
          reference.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={reference.embedUrl ?? reference.url}
              alt=""
              className="max-h-44 w-full rounded-[12px] object-cover"
            />
          ) : (
            <div className="aspect-[9/16] max-h-56 w-full overflow-hidden rounded-[12px] bg-black/5">
              <iframe
                src={reference.embedUrl ?? ''}
                title="Референс"
                className="h-full w-full"
                allow="autoplay; encrypted-media; picture-in-picture"
              />
            </div>
          )
        ) : null}

        {error ? (
          <p role="alert" className="text-[13px] text-red-600">
            {error}
          </p>
        ) : null}

        {pending !== null ? (
          <div
            data-testid="reference-conflict"
            className="rounded-[14px] border border-[color:var(--accent)] bg-[color:var(--accent-soft)] p-3"
          >
            <p className="text-[13px] leading-snug text-[color:var(--foreground)]">
              У тебе вже щось написано. Замінити текст на розшифровку референсу?
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onText(pending);
                  setPending(null);
                  onClose();
                }}
                className="min-h-11 flex-1 rounded-[12px] bg-[color:var(--accent)] text-[14px] font-semibold text-white"
              >
                Замінити
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                className="min-h-11 flex-1 rounded-[12px] border border-[color:var(--border)] text-[14px] font-semibold text-[color:var(--foreground)]"
              >
                Лишити як референс
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            data-testid="pull-reference"
            disabled={busy || !link.trim()}
            onClick={() => void pull()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[color:var(--accent)] text-[15px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {busy ? 'Розбираю…' : 'Витягнути текст'}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
