import { CONTENT_TYPES, type ContentType } from '@/lib/contentTypes';

/**
 * Repurposing — the vocabulary, shared by client and server.
 *
 * One published post in → one NEW piece in another format out. The whole feature
 * is two decisions: what did you paste (source), and what should it become
 * (target). Everything else (extraction, generation, persistence) is plumbing
 * that already exists for braindumps — repurposing just feeds it a different
 * kind of raw input.
 *
 * Kept import-light (only the content-type palette) so the overlay can detect a
 * link and label it live, with no server round-trip.
 */

/** What kind of post the user pasted. */
export type RepurposeSourceKind = 'reel' | 'tiktok' | 'threads';

/** What we can turn it into. Three app content types + a Threads text post. */
export type RepurposeTarget = ContentType | 'threads';

export interface RepurposeSourceMeta {
  kind: RepurposeSourceKind;
  /** Ukrainian label for the detected-source chip. */
  label: string;
  color: string;
  soft: string;
  /** How the source text is obtained — shown as honest progress copy. */
  extractLabel: string;
}

export const REPURPOSE_SOURCES: Record<RepurposeSourceKind, RepurposeSourceMeta> = {
  reel: {
    kind: 'reel',
    label: 'Instagram Reel',
    color: '#004BA8',
    soft: 'rgba(0, 75, 168, 0.10)',
    extractLabel: 'Завантажую рілс і розпізнаю мову…',
  },
  tiktok: {
    kind: 'tiktok',
    label: 'TikTok',
    color: '#0F0F14',
    soft: 'rgba(15, 15, 20, 0.08)',
    extractLabel: 'Завантажую відео і розпізнаю мову…',
  },
  threads: {
    kind: 'threads',
    label: 'Threads',
    color: '#1F1F1F',
    soft: 'rgba(31, 31, 31, 0.08)',
    extractLabel: 'Читаю пост у Threads…',
  },
};

export interface RepurposeTargetMeta {
  target: RepurposeTarget;
  label: string;
  color: string;
  soft: string;
  /** One line of Ruta's thinking, shown on the result card. */
  rationale: string;
}

export const REPURPOSE_TARGETS: Record<RepurposeTarget, RepurposeTargetMeta> = {
  carousel: {
    target: 'carousel',
    label: CONTENT_TYPES.carousel.label,
    color: CONTENT_TYPES.carousel.color,
    soft: CONTENT_TYPES.carousel.soft,
    rationale: 'Та сама думка, розкладена на слайди — одна думка на слайд.',
  },
  reels: {
    target: 'reels',
    label: CONTENT_TYPES.reels.label,
    color: CONTENT_TYPES.reels.color,
    soft: CONTENT_TYPES.reels.soft,
    rationale: 'Текст переписаний під камеру: хук окремо, сцени по 3–5 секунд.',
  },
  stories: {
    target: 'stories',
    label: CONTENT_TYPES.stories.label,
    color: CONTENT_TYPES.stories.color,
    soft: CONTENT_TYPES.stories.soft,
    rationale: 'Розтягнуто в історію зі слайдами та інтерактивом.',
  },
  threads: {
    target: 'threads',
    label: 'Threads',
    color: '#1F1F1F',
    soft: 'rgba(31, 31, 31, 0.08)',
    rationale: 'Стисло, текстом: перший пост тримає, решта дотискає.',
  },
};

/**
 * What each source can become.
 *
 * The source's OWN format is deliberately absent — repurposing a reel into a
 * reel is a rewrite, not a repurpose, and the app already has «Наговорити» for
 * that. TikTok is treated as a reel (same video → transcript pipeline), so it
 * offers the same targets.
 */
export const TARGETS_BY_SOURCE: Record<RepurposeSourceKind, RepurposeTarget[]> = {
  reel: ['carousel', 'threads', 'stories'],
  tiktok: ['carousel', 'threads', 'stories'],
  threads: ['carousel', 'reels', 'stories'],
};

/** Guard used by the overlay before firing a generation for a pasted source. */
export function isTargetAllowed(kind: RepurposeSourceKind, target: RepurposeTarget): boolean {
  return TARGETS_BY_SOURCE[kind].includes(target);
}

/** Targets that land in an existing app content type (everything but Threads). */
export function isContentTypeTarget(target: RepurposeTarget): target is ContentType {
  return target !== 'threads';
}
