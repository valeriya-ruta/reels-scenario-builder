/**
 * What a piece is CALLED, everywhere (§1) — pure.
 *
 * Two rules, no third state:
 *
 *  1. «Без назви» / "no name" is banned. It was being written into the database
 *     as a literal name at creation, so it was not even a display fallback — a
 *     brand-new carousel was genuinely *called* "Без назви". An untitled piece
 *     gets a type-appropriate name instead: «Новий рілс» / «Нова карусель» /
 *     «Нова історія».
 *
 *  2. `displayTitle = savedTitle || newLabel(type)`. That is the whole rule.
 *
 * Kept import-free so both the server reads and the client cards use exactly the
 * same logic and cannot drift.
 */

export type TitleKind = 'reel' | 'carousel' | 'story' | 'idea';

/** Names that mean "this was never named", however they got into the row. */
const PLACEHOLDER_NAMES = new Set([
  'без назви',
  'no name',
  'untitled',
  'сторітел',
  // The label storytellings used to be created with. Rows still carrying it were
  // never named by anyone, so they show today's label rather than yesterday's.
  'нова історія',
]);

export const NEW_LABELS: Record<TitleKind, string> = {
  reel: 'Новий рілс',
  carousel: 'Нова карусель',
  // The thing itself is a «сторітел» — that is what the board's columns are
  // called and what the add button says, so an untitled one is named for it.
  story: 'Новий сторітел',
  idea: 'Нова думка',
};

export function isPlaceholderTitle(title: string | null | undefined): boolean {
  const t = (title ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return t.length === 0 || PLACEHOLDER_NAMES.has(t);
}

/** The name to show. Never empty, never a placeholder. */
export function displayTitle(title: string | null | undefined, kind: TitleKind): string {
  const t = (title ?? '').replace(/\s+/g, ' ').trim();
  return isPlaceholderTitle(t) ? NEW_LABELS[kind] : t;
}

/**
 * Whether a preview line adds anything beyond the title.
 *
 * A carousel's project name is DERIVED from its first slide's title
 * (`deriveCarouselNameFromRant`), so for every braindump-created carousel the
 * name and the cover line are the same string — which is exactly how the card
 * ended up rendering its title twice. When they match, the card shows one.
 */
export function previewAddsInfo(
  title: string | null | undefined,
  preview: string | null | undefined,
): boolean {
  const t = normalizeForCompare(title);
  const p = normalizeForCompare(preview);
  if (!p) return false;
  if (!t) return true;
  // Not just equality: a name is a CLIPPED slide title, so one is often a prefix
  // of the other.
  return !(t === p || t.startsWith(p) || p.startsWith(t));
}

function normalizeForCompare(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/[«»"'`.,!?…—–-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
