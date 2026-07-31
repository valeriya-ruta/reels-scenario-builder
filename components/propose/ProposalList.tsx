'use client';

import { Sparkles } from 'lucide-react';
import ContentTypeIcon from '@/components/ContentTypeIcon';
import { CONTENT_TYPES } from '@/lib/contentTypes';
import { useTapGuard } from '@/lib/ui/tapGuard';
import type { Proposal } from '@/lib/propose/types';

/**
 * The front door of every creation entry point: Ruta's proposals, tappable.
 *
 * Each card carries its one-line rationale — that line is the whole difference
 * between "an assistant that thought about this" and "a button". A proposal is
 * never rendered without one (the API contract drops rationale-less proposals),
 * so there is no bare-button state to design for.
 */
export default function ProposalList({
  proposals,
  loading,
  onPick,
  disabled,
}: {
  proposals: Proposal[];
  loading?: boolean;
  onPick: (proposal: Proposal) => void;
  disabled?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2" data-testid="proposal-loading">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={`prop-sk-${i}`}
            className="relative overflow-hidden rounded-[16px] border border-[color:var(--border)] bg-white/70 px-4 py-3.5"
          >
            <div className="reels-planner-skeleton-shimmer absolute inset-0 opacity-70" />
            <div className="h-3.5 w-3/4 rounded bg-[color:var(--surface2)]" />
            <div className="mt-2 h-2.5 w-1/2 rounded bg-[color:var(--surface1)]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <ul className="space-y-2" data-testid="proposal-list">
      {proposals.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} disabled={disabled} onPick={onPick} />
      ))}
    </ul>
  );
}

/** One proposal. Split out so each card owns its own tap guard (§0). */
function ProposalCard({
  proposal,
  disabled,
  onPick,
}: {
  proposal: Proposal;
  disabled?: boolean;
  onPick: (proposal: Proposal) => void;
}) {
  const meta = proposal.suggestedType ? CONTENT_TYPES[proposal.suggestedType] : null;
  // The deck sits in the braindump's scroll region, so a scroll that starts on a
  // card must not confirm that angle.
  const tap = useTapGuard(() => onPick(proposal));
  return (
    <li>
            <button
              type="button"
              disabled={disabled}
              {...tap}
              data-testid="proposal-card"
              data-source={proposal.source}
              className="group w-full rounded-[16px] border border-[color:var(--border)] bg-white/85 px-4 py-3.5 text-left transition-all hover:border-[color:var(--border-strong)] hover:bg-white active:scale-[0.99] disabled:opacity-50"
              style={{ boxShadow: 'var(--elev-1)' }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
                  style={{ backgroundColor: meta?.soft ?? 'var(--accent-soft)' }}
                >
                  {meta ? (
                    <ContentTypeIcon type={meta.type} size={15} />
                  ) : (
                    <Sparkles className="h-4 w-4 text-[color:var(--accent)]" strokeWidth={2.2} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug tracking-tight text-[color:var(--foreground)]">
                    {proposal.title}
                  </span>
                  {/* Ruta's thinking, one line. */}
                  <span className="mt-1 block text-[12.5px] leading-snug text-[color:var(--text-muted)]">
                    {proposal.rationale}
                  </span>
                </span>
              </div>
            </button>
    </li>
  );
}
