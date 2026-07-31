'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Minus, Plus } from 'lucide-react';
import type { Scene } from '@/lib/domain';
import {
  toTeleprompterBeats,
  estimateSpokenSeconds,
  formatDuration,
  beatsToPlainText,
} from '@/lib/content/teleprompter';

/**
 * Суфлер — the reel as one thing you read, not a form you fill in.
 *
 * A dark, full-bleed reading surface with large type and long measure: the
 * opposite of the scenario view by design, so the two modes are distinguishable
 * from across the room. No scene chrome, no framing labels, no note fields —
 * only the words that come out of the creator's mouth, in order.
 *
 * Read-only on purpose. Editing lives in Сценарій; mixing the two would give
 * back exactly the "one screen with a toggle" this mode replaces.
 */

const SIZES = [26, 30, 36, 44, 54] as const;
const DEFAULT_SIZE_INDEX = 2;

export default function Teleprompter({ scenes }: { scenes: Scene[] }) {
  const beats = useMemo(() => toTeleprompterBeats(scenes), [scenes]);
  const seconds = useMemo(() => estimateSpokenSeconds(beats), [beats]);
  const [sizeIndex, setSizeIndex] = useState<number>(DEFAULT_SIZE_INDEX);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(beatsToPlainText(beats));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be denied */
    }
  };

  if (beats.length === 0) {
    return (
      <div className="rounded-[18px] border border-[color:var(--border)] bg-[#111114] px-6 py-16 text-center">
        <p className="text-[15px] font-semibold text-white/80">Ще нема що читати</p>
        <p className="mx-auto mt-1.5 max-w-[20rem] text-[13px] leading-relaxed text-white/45">
          Напиши репліки у «Сценарії» — тут вони складуться в суцільний текст, з якого можна
          знімати.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="teleprompter"
      className="overflow-hidden rounded-[18px] border border-black/40 bg-[#111114]"
    >
      {/* Reading controls only: size, length, copy. Nothing editorial. */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="text-[12px] font-medium tabular-nums text-white/45">
          ≈ {formatDuration(seconds)} · {beats.length} реплік
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSizeIndex((i) => Math.max(0, i - 1))}
            disabled={sizeIndex === 0}
            aria-label="Менший текст"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <Minus className="h-4 w-4" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => setSizeIndex((i) => Math.min(SIZES.length - 1, i + 1))}
            disabled={sizeIndex === SIZES.length - 1}
            aria-label="Більший текст"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={copy}
            aria-label="Копіювати текст"
            title={copied ? 'Скопійовано' : 'Копіювати текст'}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-400" strokeWidth={2.2} />
            ) : (
              <Copy className="h-4 w-4" strokeWidth={1.8} />
            )}
          </button>
        </div>
      </div>

      <div
        className="max-h-[68vh] overflow-y-auto px-6 py-10 sm:px-10"
        style={{ overscrollBehavior: 'contain' }}
      >
        {beats.map((beat) => (
          <p
            key={beat.index}
            data-testid="teleprompter-beat"
            className="mx-auto max-w-[30ch] text-balance font-semibold tracking-[-0.015em] text-white sm:max-w-[34ch]"
            style={{
              fontSize: SIZES[sizeIndex],
              lineHeight: 1.35,
              marginTop: beat.index === 1 ? 0 : SIZES[sizeIndex] * 1.1,
            }}
          >
            {/* Structural beats are marked, never mixed into what's spoken. */}
            {beat.label ? (
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
                {beat.label}
              </span>
            ) : null}
            {beat.text}
          </p>
        ))}
      </div>
    </div>
  );
}
