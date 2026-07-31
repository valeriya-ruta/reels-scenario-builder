/**
 * Daily idea deck: resurface BEFORE generate (Prompt 6) — pure policy.
 *
 * The anti-graveyard rule. Execution is the hard part Ruta solves; generating
 * infinite ideas on top of an unexecuted backlog is the failure mode, not the
 * feature. So the deck's job is to make the backlog SMALLER, never bigger.
 *
 *   no backlog      → generate everything
 *   large backlog   → resurface only; generate NOTHING
 *   partial backlog → mix, with quality deciding what goes first
 *
 * Kept import-free so the arithmetic is testable without a DB or a model.
 */

export const DECK_MIN = 5;
export const DECK_MAX = 10;
/**
 * At or above this many unused ideas the deck stops generating entirely.
 * Chosen as DECK_MAX: once the backlog alone can fill a whole deck, there is no
 * honest argument for adding to it.
 */
export const BACKLOG_FULL = DECK_MAX;

export type BacklogIdea = {
  id: string;
  /** Excerpt or title, for the card. */
  text: string;
  /** Days since it was captured — older ideas have waited longer. */
  ageDays: number;
  /**
   * True when this idea came from a braindump that produced a WINNER, or is
   * otherwise flagged strong. These jump the queue regardless of age.
   */
  proven?: boolean;
};

export type DeckPlan = {
  mode: 'generate' | 'resurface' | 'mix';
  /** Backlog ideas to show, already ordered. */
  resurface: BacklogIdea[];
  /** How many fresh ideas to ask the model for. */
  generateCount: number;
};

/**
 * Order the backlog for the deck: proven ideas first (a signal beats a
 * timestamp), then oldest — the ones most at risk of never being made.
 */
export function rankBacklog(ideas: ReadonlyArray<BacklogIdea>): BacklogIdea[] {
  return [...ideas].sort((a, b) => {
    if (!!a.proven !== !!b.proven) return a.proven ? -1 : 1;
    return b.ageDays - a.ageDays;
  });
}

export function planDeck(
  backlog: ReadonlyArray<BacklogIdea>,
  size: number = DECK_MAX,
): DeckPlan {
  const deckSize = Math.max(DECK_MIN, Math.min(DECK_MAX, Math.floor(size)));
  const ranked = rankBacklog(backlog);

  if (ranked.length === 0) {
    return { mode: 'generate', resurface: [], generateCount: deckSize };
  }

  if (ranked.length >= BACKLOG_FULL) {
    // Full pile: the deck is entirely a clear-out. Generating here would be the
    // graveyard failure mode in one step.
    return { mode: 'resurface', resurface: ranked.slice(0, deckSize), generateCount: 0 };
  }

  // Partial: everything in the backlog gets a slot, new ideas fill the rest.
  return {
    mode: 'mix',
    resurface: ranked,
    generateCount: Math.max(0, deckSize - ranked.length),
  };
}

/** Does this plan add to the pile? Must be false whenever the backlog is full. */
export function growsBacklog(plan: DeckPlan, backlogSize: number): boolean {
  return backlogSize >= BACKLOG_FULL && plan.generateCount > 0;
}
