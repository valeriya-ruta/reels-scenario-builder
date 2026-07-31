/**
 * Re-selecting a structure must never STACK a second one (§4, task 86d3wadne).
 *
 * The old handler appended the template's scenes at `scenes.length`, so picking
 * a structure twice produced one reel containing both — the scenario silently
 * doubled and the user had to delete the leftovers by hand.
 *
 * The rule, kept pure so it is testable without a DB:
 *   • nothing written yet  → REPLACE silently (there is nothing to lose)
 *   • something written    → ASK: replace & rewrite this reel, or spin off a new
 *                            one. Never append, never overwrite without consent.
 */

type SceneLike = { lines: string | null };

export type StructureAction = 'replace-silently' | 'ask';

/**
 * Whether the reel contains authored writing. Scene NAMES don't count — a
 * template drops in named-but-empty scenes, and treating those as "written"
 * would prompt the user about work they never did.
 */
export function reelHasWriting(scenes: ReadonlyArray<SceneLike>): boolean {
  return scenes.some((s) => (s.lines ?? '').trim().length > 0);
}

export function structureAction(scenes: ReadonlyArray<SceneLike>): StructureAction {
  return reelHasWriting(scenes) ? 'ask' : 'replace-silently';
}
