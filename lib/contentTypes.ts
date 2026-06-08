/**
 * Semantic content-type palette + metadata.
 *
 * These are the SHARED content-type tokens used across the app (Home recents,
 * Create radial menu, Braindump overlay). They are a *semantic* palette only —
 * used for type icons/tags. Blue (#004BA8) remains the functional UI accent;
 * the per-type tints below are decorative and kept soft.
 *
 * Defined once here so future features reuse the same colors, labels and routes
 * instead of hardcoding hexes. The matching CSS variables live in globals.css
 * (`--type-reels` / `--type-carousel` / `--type-stories`).
 */

export type ContentType = 'reels' | 'carousel' | 'stories';

export interface ContentTypeMeta {
  /** Internal id. */
  type: ContentType;
  /** Ukrainian label shown to users. */
  label: string;
  /** Tint color (semantic, decorative). */
  color: string;
  /** Soft tint background (for subtle fills). */
  soft: string;
  /** Route that opens the creation flow for this type. */
  createHref: string;
  /** Builds the route to open a specific item of this type. */
  itemHref: (id: string) => string;
}

export const CONTENT_TYPES: Record<ContentType, ContentTypeMeta> = {
  reels: {
    type: 'reels',
    label: 'Рілс',
    color: '#004BA8',
    soft: 'rgba(0, 75, 168, 0.10)',
    createHref: '/projects',
    itemHref: (id) => `/project/${id}`,
  },
  carousel: {
    type: 'carousel',
    label: 'Карусель',
    color: '#7850A0',
    soft: 'rgba(120, 80, 160, 0.12)',
    createHref: '/carousel',
    itemHref: (id) => `/carousel/${id}`,
  },
  stories: {
    type: 'stories',
    label: 'Сторіс',
    color: '#C08C28',
    soft: 'rgba(192, 140, 40, 0.12)',
    createHref: '/storytellings',
    itemHref: (id) => `/storytelling/${id}`,
  },
};

export const CONTENT_TYPE_ORDER: ContentType[] = ['reels', 'carousel', 'stories'];

/**
 * Compact Ukrainian relative-time label ("щойно", "5 хв", "2 год", "3 дн",
 * "12.05"). Intentionally terse for the ClickUp-style list sublines.
 */
export function relativeTimeUk(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.round((now - then) / 1000));

  if (diffSec < 60) return 'щойно';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} хв`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} год`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} дн`;

  const d = new Date(then);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}
