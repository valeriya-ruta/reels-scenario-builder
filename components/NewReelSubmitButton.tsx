'use client';

import { useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';

interface NewReelSubmitButtonProps {
  /** Accessible label — the button is icon-only, like the other list pages. */
  idleLabel: string;
  pendingLabel: string;
  /** Tint of the round button — defaults to the app accent. */
  accent?: string;
}

/**
 * Round "+" create button for list pages.
 *
 * Previously this rendered a wide text button («Новий сторітелінг») while the
 * reels/carousel lists used a round ＋ — the same action looked like two
 * different controls. One shape everywhere.
 */
export default function NewReelSubmitButton({
  idleLabel,
  pendingLabel,
  accent = 'var(--accent)',
}: NewReelSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={pending ? pendingLabel : idleLabel}
      title={idleLabel}
      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white shadow-[var(--elev-1)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      style={{ backgroundColor: accent }}
    >
      {pending ? '…' : <Plus className="h-5 w-5" strokeWidth={2.4} />}
    </button>
  );
}
