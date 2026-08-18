'use client';

import { useState } from 'react';
import { Captions, Film, Link2, ListChecks, Loader2, Sparkles } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
import { readReference, saveReelMeta, writeCaption } from '@/app/reel-actions';
import { isPlayable, resolveReference } from '@/lib/reels/referenceLink';
import type { Project } from '@/lib/domain';

/**
 * Everything the note needs but does not need on screen while writing.
 *
 * The toolbar carries the two things done constantly — dictate, and turn the
 * dump into a reel. These are the rest: read the clean script, work down the
 * editing list, write the caption, keep a reference. Behind one ⋯ because a
 * seven-button bar over the keyboard is the clutter this rebuild is undoing.
 */
export default function ReelMoreSheet({
  open,
  project,
  script,
  hasWriting,
  onClose,
  onOpenScript,
  onOpenOverlays,
  onAddClip,
  onProjectUpdate,
  onReferenceText,
}: {
  open: boolean;
  project: Project & { caption?: string | null };
  script: string;
  hasWriting: boolean;
  onClose: () => void;
  onOpenScript: () => void;
  onOpenOverlays: () => void;
  onAddClip: () => void;
  onProjectUpdate: (next: Project) => void;
  onReferenceText: (text: string) => void;
}) {
  const [caption, setCaption] = useState(project.caption ?? '');
  const [link, setLink] = useState(project.reference_url ?? '');
  const [busy, setBusy] = useState<null | 'caption' | 'reference'>(null);
  const [error, setError] = useState<string | null>(null);
  // The transcript of a reference, held until she says what to do with it.
  const [pending, setPending] = useState<string | null>(null);

  const saveCaption = (next: string) => {
    setCaption(next);
    void saveReelMeta(project.id, { caption: next });
  };

  const generate = async () => {
    if (busy) return;
    setBusy('caption');
    setError(null);
    const res = await writeCaption(script);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    saveCaption(res.data.caption);
  };

  /**
   * Reading a reference NEVER overwrites silently.
   *
   * On an empty note its words simply become the note — there is nothing to
   * lose. With writing already on the page the transcript is held and she is
   * asked, because «розібрати» meaning «delete what I wrote» is the kind of
   * surprise that costs a whole evening's work.
   */
  const pull = async () => {
    if (busy) return;
    setBusy('reference');
    setError(null);
    void saveReelMeta(project.id, { referenceUrl: link.trim() || null });
    const res = await readReference(link);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (!hasWriting) {
      onReferenceText(res.data.text);
      onClose();
      return;
    }
    setPending(res.data.text);
  };

  const reference = resolveReference(link);

  return (
    <BottomSheet open={open} onClose={onClose} title="Ще">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Tile icon={<Captions className="h-5 w-5" />} label="Чистий текст" onClick={onOpenScript} />
          <Tile icon={<ListChecks className="h-5 w-5" />} label="Що поверх" onClick={onOpenOverlays} />
          <Tile icon={<Film className="h-5 w-5" />} label="Кадр" onClick={onAddClip} />
        </div>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[color:var(--foreground)]">Підпис під рілс</p>
            <button
              type="button"
              disabled={busy !== null || !script.trim()}
              onClick={() => void generate()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[color:var(--accent-soft)] px-3 text-[12px] font-semibold text-[color:var(--accent)] disabled:opacity-40"
            >
              {busy === 'caption' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {caption.trim() ? 'Ще раз' : 'Написати'}
            </button>
          </div>
          <textarea
            value={caption}
            onChange={(e) => saveCaption(e.target.value)}
            rows={3}
            placeholder="Те, що читають під відео — не те, що ти кажеш у кадрі."
            className="w-full resize-none rounded-[12px] border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2.5 text-[14px] leading-snug text-[color:var(--foreground)] placeholder-[color:var(--text-muted)] outline-none focus:border-[color:var(--accent)]"
          />
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-[color:var(--foreground)]">Референс</p>
          <div className="flex gap-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onBlur={() => void saveReelMeta(project.id, { referenceUrl: link.trim() || null })}
              inputMode="url"
              placeholder="Посилання на Reels"
              className="min-h-11 min-w-0 flex-1 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--background)] px-3 text-[14px] text-[color:var(--foreground)] placeholder-[color:var(--text-muted)] outline-none focus:border-[color:var(--accent)]"
            />
            <button
              type="button"
              data-testid="pull-reference"
              disabled={busy !== null || !link.trim()}
              onClick={() => void pull()}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[12px] border border-[color:var(--border)] px-3 text-[13px] font-semibold text-[color:var(--foreground)] disabled:opacity-40"
            >
              {busy === 'reference' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Розібрати
            </button>
          </div>

          {isPlayable(reference) && reference ? (
            reference.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={reference.embedUrl ?? reference.url} alt="" className="max-h-40 w-full rounded-[12px] object-cover" />
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
        </section>

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
                  onReferenceText(pending);
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
        ) : null}
      </div>
    </BottomSheet>
  );
}

function Tile({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[76px] flex-1 flex-col items-center justify-center gap-1.5 rounded-[14px] border border-[color:var(--border)] bg-[color:var(--background)] text-[12px] font-semibold text-[color:var(--foreground)]"
    >
      <span className="text-[color:var(--text-secondary)]">{icon}</span>
      {label}
    </button>
  );
}
