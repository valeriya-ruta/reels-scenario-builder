'use client';

import { useState } from 'react';
import { Captions, Film, Link2, ListChecks, Loader2, Sparkles } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
import StatusPill from '@/components/content/StatusPill';
import ScheduleChip from '@/components/content/ScheduleChip';
import { saveReelMeta, writeCaption } from '@/app/reel-actions';
import type { Project } from '@/lib/domain';

/**
 * Everything the reel has that is not the words.
 *
 * The header used to carry all of it — status, date, duration, reference, save
 * state — as a row of small chips above the text. Five tap targets under 44pt
 * in the part of the screen a thumb reaches last, on the screen whose whole
 * point is one column of text. It read as clutter and it was.
 *
 * So the header keeps only what is READ (how long the reel runs, whether it
 * saved) and everything TAPPED lives here, one tap from the toolbar in the
 * bottom third, at full width where it can be hit.
 *
 * Ordered the way the work goes: the reference is the thing you have BEFORE you
 * write, so it is first and it is a real, filled button rather than the greyed
 * outline that made her think it was disabled.
 */
export default function ReelMoreSheet({
  open,
  project,
  script,
  referenceUrl,
  onClose,
  onOpenReference,
  onOpenScript,
  onOpenOverlays,
  onAddClip,
}: {
  open: boolean;
  project: Project & { caption?: string | null };
  script: string;
  referenceUrl: string | null;
  onClose: () => void;
  onOpenReference: () => void;
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
        <button
          type="button"
          data-testid="reference-chip"
          onClick={onOpenReference}
          className="flex min-h-[52px] w-full items-center gap-2.5 rounded-[14px] bg-[color:var(--accent-soft)] px-3.5 text-left text-[14px] font-semibold text-[color:var(--accent)]"
        >
          <Link2 className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {referenceUrl ? referenceUrl.replace(/^https?:\/\/(www\.)?/, '') : 'Додати референс'}
          </span>
        </button>

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

        {/* Status and date are planning, not writing. They belong to the reel,
            but never to the screen she is writing on. */}
        <section className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border)] pt-3.5">
          <StatusPill
            refTable="projects"
            id={project.id}
            type="reel"
            initialStatus={project.status ?? 'idea'}
          />
          <ScheduleChip
            refTable="projects"
            id={project.id}
            initialDate={project.scheduled_date ?? null}
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
