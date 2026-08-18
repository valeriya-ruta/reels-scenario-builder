'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { cleanScript, hasScript, scriptWordCount } from '@/lib/reels/script';
import { estimateSeconds, formatDuration, type ReelBlock } from '@/lib/reels/blocks';

/**
 * The script, and one button.
 *
 * There is no teleprompter in this app and there will not be: a teleprompter
 * without recording is pointless, and recording drags editing in behind it. So
 * the handoff is a copy button, and what it copies goes into Instagram Edits.
 *
 * Which makes copy FIDELITY the whole feature. No numbering, no scene labels,
 * no speaker names, no markers — see lib/reels/script.ts, which is where that
 * is enforced and tested.
 */
export default function CleanScriptSheet({
  open,
  blocks,
  onClose,
}: {
  open: boolean;
  blocks: ReelBlock[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  // Reopening the sheet must not still say «Скопійовано» from last time.
  // Adjusted during render rather than in an effect: an effect would paint the
  // stale label for one frame first.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setCopied(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const script = cleanScript(blocks);
  const present = hasScript(blocks);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
    } catch {
      // Older WebViews refuse the async clipboard; the textarea route still works.
      const area = document.createElement('textarea');
      area.value = script;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      data-testid="clean-script"
      className="fixed inset-0 z-[110] flex flex-col bg-[color:var(--background)]"
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(14px,env(safe-area-inset-top))]">
        <div>
          <p className="app-title text-[17px]">Чистий текст</p>
          <p className="text-[12px] tabular-nums text-[color:var(--text-muted)]">
            ~{formatDuration(estimateSeconds(blocks))} · {scriptWordCount(blocks)} слів
          </p>
        </div>
        <button
          type="button"
          aria-label="Закрити"
          onClick={onClose}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[color:var(--text-muted)]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {present ? (
          // `whitespace-pre-wrap` so what she sees is what the clipboard holds.
          <p className="whitespace-pre-wrap break-words text-[18px] leading-[1.62] text-[color:var(--foreground)]">
            {script}
          </p>
        ) : (
          <p className="pt-10 text-center text-[15px] leading-relaxed text-[color:var(--text-muted)]">
            У цьому рілсі нічого не говориться вголос.
            <br />
            Написи на екрані — у «Що поверх».
          </p>
        )}
      </div>

      {present ? (
        <div className="px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
          <button
            type="button"
            data-testid="copy-script"
            onClick={copy}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-[color:var(--accent)] text-[16px] font-semibold text-white"
          >
            {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            {copied ? 'Скопійовано' : 'Скопіювати весь текст'}
          </button>
          <p className="mt-2 text-center text-[11.5px] leading-snug text-[color:var(--text-muted)]">
            З абзацами, без міток — щоб вставити в Edits чи будь-який суфлер.
          </p>
        </div>
      ) : null}
    </div>
  );
}
