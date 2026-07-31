'use client';

import { Check, RefreshCw, Wand2 } from 'lucide-react';

/**
 * The three verbs every AI result is acted on with, everywhere in the app:
 *
 *   Лишаємо (Keep)        — commit and move the piece forward
 *   Ще раз (Regenerate)   — re-propose
 *   Підкрутити (Tweak)    — open the secondary refine affordance
 *
 * Plus the one-line rationale above them. Nothing generated should ever feel
 * final-on-arrival, and nothing should require the user to know what to type
 * next — "Підкрутити" is the ONLY place a text box appears, and it is always
 * secondary to the two decisive verbs.
 */
export default function ProposalActions({
  rationale,
  onKeep,
  onRegenerate,
  onTweak,
  keepLabel = 'Лишаємо',
  busy = false,
  regenerating = false,
  className = '',
}: {
  /** One line of Ruta's thinking about this result. */
  rationale?: string | null;
  onKeep: () => void;
  onRegenerate: () => void;
  onTweak: () => void;
  keepLabel?: string;
  busy?: boolean;
  regenerating?: boolean;
  className?: string;
}) {
  return (
    <div className={className} data-testid="proposal-actions">
      {rationale ? (
        <p
          data-testid="proposal-rationale"
          className="mb-2.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-[color:var(--text-muted)]"
        >
          <span aria-hidden className="mt-[2px] text-[color:var(--accent)]">
            ✻
          </span>
          <span className="min-w-0">{rationale}</span>
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onKeep}
          disabled={busy}
          data-testid="proposal-keep"
          className="app-btn-primary flex-1"
        >
          <Check className="h-4 w-4" strokeWidth={2.4} />
          {keepLabel}
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={busy || regenerating}
          data-testid="proposal-regenerate"
          aria-label="Згенерувати ще раз"
          title="Ще раз"
          className="app-icon-btn"
        >
          <RefreshCw
            className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`}
            strokeWidth={2}
          />
        </button>
        <button
          type="button"
          onClick={onTweak}
          disabled={busy}
          data-testid="proposal-tweak"
          aria-label="Підкрутити"
          title="Підкрутити"
          className="app-icon-btn"
        >
          <Wand2 className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
