'use client';

import ProposalList from '@/components/propose/ProposalList';
import { useProposals } from '@/components/propose/useProposals';
import { OPEN_BRAINDUMP_FRESH_EVENT } from '@/lib/content/braindumpIdeaEvent';
import type { Proposal } from '@/lib/propose/types';

/**
 * The only empty state this app is allowed to have.
 *
 * No surface says "нічого немає" and stops. Every empty surface proposes a
 * concrete next move, drawn from the user's own signals, and every proposal is
 * tappable — an empty screen is the moment the assistant is most useful, not
 * least.
 */
export default function ProposingEmptyState({
  headline,
  sub,
  limit = 2,
  onPick,
}: {
  headline: string;
  /** One line explaining what this surface is for. */
  sub?: string;
  limit?: number;
  /** Defaults to opening the braindump on the chosen angle. */
  onPick?: (proposal: Proposal) => void;
}) {
  const { proposals, loading } = useProposals(true);

  const pick = (proposal: Proposal) => {
    if (onPick) {
      onPick(proposal);
      return;
    }
    window.dispatchEvent(
      new CustomEvent(OPEN_BRAINDUMP_FRESH_EVENT, { detail: { angle: proposal } }),
    );
  };

  return (
    <div data-testid="proposing-empty" className="app-card overflow-hidden px-4 py-5">
      <p className="text-[15px] font-semibold leading-snug text-[color:var(--foreground)]">
        {headline}
      </p>
      {sub ? (
        <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--text-muted)]">{sub}</p>
      ) : null}
      <div className="mt-3.5">
        <ProposalList proposals={proposals.slice(0, limit)} loading={loading} onPick={pick} />
      </div>
    </div>
  );
}
