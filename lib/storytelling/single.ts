/**
 * One storytelling = one story (§3, de-projectify) — pure helpers.
 *
 * The board used to nest several storytellings inside one project as columns.
 * That model is gone from the UI, but the `storytelling_columns` table stays
 * (no migration), so legacy rows can still be spread across several columns.
 *
 * The rule: read from ALL columns, write to the FIRST. Flattening rather than
 * showing only column one matters — hiding a legacy column would look exactly
 * like data loss to the user, and the rows are still perfectly good stories.
 */

type ColumnLike = { id: string; order_index: number };
type StoryLike = { id: string; column_id: string; order_index: number };

/** The canonical column new cards append to, or null if the project has none. */
export function primaryColumnId(columns: ReadonlyArray<ColumnLike>): string | null {
  if (columns.length === 0) return null;
  return [...columns].sort((a, b) => a.order_index - b.order_index)[0].id;
}

/**
 * All stories as ONE ordered run: columns in their own order, and within each
 * column the stories in theirs. Stories whose column is missing are appended
 * rather than dropped — an orphaned row is still the user's writing.
 */
export function flattenStories<S extends StoryLike>(
  columns: ReadonlyArray<ColumnLike>,
  stories: ReadonlyArray<S>,
): S[] {
  const columnOrder = new Map(
    [...columns].sort((a, b) => a.order_index - b.order_index).map((c, i) => [c.id, i]),
  );

  return [...stories].sort((a, b) => {
    // Unknown column → sorts last, but never disappears.
    const ca = columnOrder.get(a.column_id) ?? Number.MAX_SAFE_INTEGER;
    const cb = columnOrder.get(b.column_id) ?? Number.MAX_SAFE_INTEGER;
    if (ca !== cb) return ca - cb;
    return a.order_index - b.order_index;
  });
}
