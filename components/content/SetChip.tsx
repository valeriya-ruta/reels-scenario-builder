import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * "1/3" marker for a piece generated as part of a multi-day set.
 *
 * A saga is N separate storytellings (each with its own date and status), not a
 * container — so this chip is the only thing tying them together visually. It
 * lets a set read as a set in any list, calendar day or agenda group, without
 * re-introducing a parent object that a single date couldn't describe.
 */
export default function SetChip({ piece }: { piece: Pick<ContentPiece, 'setIndex' | 'setSize'> }) {
  if (!piece.setSize || piece.setSize < 2 || !piece.setIndex) return null;
  return (
    <span
      data-testid="set-chip"
      title={`Частина ${piece.setIndex} з ${piece.setSize}`}
      className="ml-1.5 inline-flex shrink-0 items-center rounded-[5px] bg-[color:var(--surface2)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none text-[color:var(--text-secondary)]"
    >
      {piece.setIndex}/{piece.setSize}
    </span>
  );
}
