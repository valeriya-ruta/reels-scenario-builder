'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { editTimeline, type TimedEditItem } from '@/lib/reels/timeline';
import { editKey, type ReelBlock } from '@/lib/reels/blocks';

/**
 * «Що поверх» — the editing list, written by the app.
 *
 * Every row here is derived: the order comes from where the phrase sits in the
 * script, and the timecode from how many words come before it. She never typed
 * a second, and she cannot get one wrong.
 *
 * The ticks are local to the device on purpose for now — this is a checklist
 * she works down while editing, not a record anyone else reads, and storing it
 * would need a table before it needs to exist.
 */
export default function OverlayListSheet({
  open,
  blocks,
  onClose,
}: {
  open: boolean;
  blocks: ReelBlock[];
  onClose: () => void;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  // Adjusted during render, not in an effect — see CleanScriptSheet.
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

  const items = editTimeline(blocks);

  const toggle = (item: TimedEditItem) => {
    const key = editKey(item);
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const asText = items.map((i) => `${i.timecode} — ${i.what}`).join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText);
    } catch {
      const area = document.createElement('textarea');
      area.value = asText;
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
      data-testid="overlay-list"
      className="fixed inset-0 z-[110] flex flex-col bg-[color:var(--background)]"
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(14px,env(safe-area-inset-top))]">
        <div>
          <p className="app-title text-[17px]">Що поверх</p>
          <p className="text-[12px] tabular-nums text-[color:var(--text-muted)]">
            {items.length} штук{done.size > 0 ? ` · ${done.size} зроблено` : ''}
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
        {items.length === 0 ? (
          <p className="pt-10 text-center text-[15px] leading-relaxed text-[color:var(--text-muted)]">
            Поки нічого поверх.
            <br />
            Виділи фразу в тексті й познач, що там зʼявляється.
          </p>
        ) : (
          items.map((item) => {
            const key = editKey(item);
            const ticked = done.has(key);
            return (
              <button
                key={key}
                type="button"
                data-testid="overlay-row"
                onClick={() => toggle(item)}
                className="flex w-full items-start gap-3 border-b border-[color:var(--border)] py-3 text-left"
              >
                <span className="w-[38px] shrink-0 pt-0.5 text-[12px] font-semibold tabular-nums text-[color:var(--text-muted)]">
                  {item.timecode}
                </span>
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[6px] border-[1.5px] text-white"
                  style={{
                    borderColor: ticked ? '#0F8A6A' : 'var(--border)',
                    backgroundColor: ticked ? '#0F8A6A' : 'transparent',
                  }}
                >
                  {ticked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                <span
                  className="min-w-0 flex-1 text-[14px] leading-snug"
                  style={{
                    color: ticked ? 'var(--text-muted)' : 'var(--foreground)',
                    textDecoration: ticked ? 'line-through' : undefined,
                  }}
                >
                  {item.what}
                  {item.url ? (
                    <span className="mt-0.5 block truncate text-[12px] text-[color:var(--accent)]">
                      {item.url}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>

      {items.length > 0 ? (
        <div className="px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
          <button
            type="button"
            data-testid="copy-overlays"
            onClick={copy}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] border border-[color:var(--border)] text-[16px] font-semibold text-[color:var(--foreground)]"
          >
            {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            {copied ? 'Скопійовано' : 'Скопіювати список'}
          </button>
          <p className="mt-2 text-center text-[11.5px] text-[color:var(--text-muted)]">
            Час — оцінка за кількістю слів.
          </p>
        </div>
      ) : null}
    </div>
  );
}
