/**
 * Proposal system — the core of "Ruta thinks for you".
 *
 * The app must never open on a blank prompt box. Every creation entry point
 * renders proposals the user *confirms*, with the free-text box demoted to a
 * secondary "or start from your own thought" affordance.
 *
 * A proposal is three things and nothing more:
 *   • `title`    — the angle, one tappable line
 *   • `rationale`— one line of Ruta's thinking (this is what converts
 *                  "AI wrapper" → "assistant"; a proposal without it is a button)
 *   • `seed`     — the text handed to the generator when the user taps it
 */

import type { ContentType } from '@/lib/contentTypes';

/** Where a proposal's evidence came from. Drives the rationale wording. */
export type ProposalSourceKind =
  /** An earlier braindump that never became content. */
  | 'unused-dump'
  /** A piece that reached Опубліковано — proof this direction works. */
  | 'proven'
  /** A piece sitting undated for too long. */
  | 'stale'
  /** Nothing to go on yet — brand-shaped opener. */
  | 'cold-start';

export type Proposal = {
  id: string;
  /** The angle itself, one line. Never a question to the user. */
  title: string;
  /** One line: why Ruta is proposing this, now. Always present. */
  rationale: string;
  /** Text fed to the generator when the user keeps this proposal. */
  seed: string;
  /** Format this angle is naturally shaped for, when the signal implies one. */
  suggestedType: ContentType | null;
  source: ProposalSourceKind;
};

/**
 * One piece of evidence about the user, distilled from their own data.
 * Deliberately small + serialisable: it is both the AI prompt's input and the
 * deterministic fallback's input, so the two never drift.
 */
export type ProposalSignal = {
  kind: ProposalSourceKind;
  /** Short human label for the thing (idea excerpt / piece title). */
  label: string;
  /** Days since the thing happened (0 = today). */
  ageDays: number;
  /** Content type involved, when known. */
  type: ContentType | null;
};

/** What `/api/propose` returns. `source: 'fallback'` means the AI leg failed. */
export type ProposeResponse = {
  proposals: Proposal[];
  source: 'ai' | 'fallback';
};

export const PROPOSAL_COUNT = 3;
