'use client';

import { useState } from 'react';
import { Captions, Film, ListChecks, Loader2, Sparkles } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
import { saveReelMeta, writeCaption } from '@/app/reel-actions';
import type { Project } from '@/lib/domain';

/**
 * Everything the note needs but does not need on screen while writing.
 *
 * The toolbar carries the two things done constantly — dictate, and turn the
 * dump into a reel. These are the rest: read the clean script, work down the
 * editing list, write the caption. Behind one ⋯ because a seven-button bar over
 * the keyboard is the clutter this rebuild is undoing.
 *
 * The REFERENCE is deliberately not here. It is an input — the thing you have
 * before you write — and burying it in a drawer of outputs meant she went
 * looking and gave up. It has its own chip beside the status and the date.
 */
export default function ReelMoreSheet({
  open,
  project,
  script,
  onClose,
  onOpenScript,
  onOpenOverlays,
  onAddClip,
}: {
  open: boolean;
  project: Project & { caption?: string | null };
  script: string;
  onClose: () => void;
  onOpenScript: () => void;
  onOpenOverlays: () => void;
  onAddClip: () => void;
}) {
  const [caption, setCaption] = useState(project.caption ?? '');
  const [busy, setBusy] = useState<null | 'caption'>(null);
  const [error, setError] = useState<string | null>(null);

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

        {error ? (
          <p role="alert" className="text-[13px] text-red-600">
            {error}
          </p>
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
