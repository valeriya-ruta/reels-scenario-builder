/**
 * Turn the user's own data into proposal signals (pure — no I/O, no `Date.now()`
 * captured implicitly; `todayIso` is always passed in so this is testable).
 *
 * The three signals we can actually evidence today:
 *   • unused-dump — a braindump with no content created from it
 *   • proven      — a piece that reached Опубліковано
 *   • stale       — a kept piece with no date, aging
 *
 * "What performed" is deliberately proxied by *published* rather than by reach:
 * the app has no analytics ingestion yet, and inventing a performance number
 * would put a lie in the rationale line. When IG insights land, `proven` is the
 * one place that swaps.
 */

import type { ContentType } from '@/lib/contentTypes';
import type { ProposalSignal } from '@/lib/propose/types';

export type SignalInputs = {
  /** Braindump ideas, newest first. */
  ideas: { id: string; content: string; createdAt: string; childCount: number }[];
  /** Content pieces, any type. */
  pieces: {
    id: string;
    title: string;
    type: ContentType | null;
    status: string;
    scheduledDate: string | null;
    updatedAt: string;
  }[];
};

/** Whole days between two ISO timestamps, never negative. */
export function ageInDays(iso: string, todayIso: string): number {
  const then = Date.parse(iso);
  const now = Date.parse(todayIso);
  if (Number.isNaN(then) || Number.isNaN(now)) return 0;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

/** First sentence (or first ~90 chars) of a braindump — enough to recognise it. */
export function excerpt(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * Rank signals so the strongest evidence leads: proven work first (it is the
 * most persuasive rationale), then dumps the user abandoned, then staleness.
 * Within a kind, the more recent signal wins.
 */
const KIND_WEIGHT = { proven: 0, 'unused-dump': 1, stale: 2, 'cold-start': 3 } as const;

export function buildSignals(inputs: SignalInputs, todayIso: string, limit = 6): ProposalSignal[] {
  const signals: ProposalSignal[] = [];

  for (const piece of inputs.pieces) {
    if (piece.status === 'published') {
      signals.push({
        kind: 'proven',
        label: piece.title,
        ageDays: ageInDays(piece.updatedAt, todayIso),
        type: piece.type,
      });
    } else if (!piece.scheduledDate) {
      const age = ageInDays(piece.updatedAt, todayIso);
      // Only genuinely aging work applies pressure; a piece from yesterday is
      // just work in flight.
      if (age >= 3) {
        signals.push({ kind: 'stale', label: piece.title, ageDays: age, type: piece.type });
      }
    }
  }

  for (const idea of inputs.ideas) {
    if (idea.childCount > 0) continue;
    signals.push({
      kind: 'unused-dump',
      label: excerpt(idea.content),
      ageDays: ageInDays(idea.createdAt, todayIso),
      type: null,
    });
  }

  signals.sort((a, b) => {
    const w = KIND_WEIGHT[a.kind] - KIND_WEIGHT[b.kind];
    return w !== 0 ? w : a.ageDays - b.ageDays;
  });

  return signals.slice(0, limit);
}
