/**
 * Content status system — single source of truth for statuses, per-type tracks,
 * palette, and type chips (Status system 1/8 — task 86d3btm87).
 *
 * Shared by frontend (ring, row, picker, list) and backend (status updates,
 * auto-save). Status keys are stored in the DB in English; this module maps them
 * to the locked Ukrainian labels + colours.
 */

export type ContentType = 'reel' | 'carousel' | 'story' | 'idea';

export type ContentStatus =
  | 'idea'
  | 'script'
  | 'film'
  | 'design'
  | 'edit'
  | 'ready'
  | 'published';

/** All 7 distinct statuses, in canonical display order (used by the picker/filter). */
export const CONTENT_STATUSES: readonly ContentStatus[] = [
  'idea',
  'script',
  'film',
  'design',
  'edit',
  'ready',
  'published',
] as const;

export const STATUS_LABELS: Record<ContentStatus, string> = {
  idea: 'Ідея',
  script: 'Скрипт',
  film: 'Зняти',
  design: 'Дизайн',
  edit: 'Змонтувати',
  ready: 'Готово',
  published: 'Опубліковано',
};

/** Locked palette (hexes tunable, progression fixed). Зняти + Дизайн share yellow. */
export const STATUS_COLORS: Record<ContentStatus, string> = {
  idea: '#9A9A9A',
  script: '#B57EDC',
  film: '#E8B81E',
  design: '#E8B81E',
  edit: '#D97726',
  ready: '#6FBF4A',
  published: '#1E6B3A',
};

/** Ordered status track for each content type. */
export const TYPE_TRACKS: Record<ContentType, readonly ContentStatus[]> = {
  reel: ['idea', 'script', 'film', 'edit', 'ready', 'published'],
  carousel: ['idea', 'script', 'design', 'ready', 'published'],
  story: ['idea', 'film', 'published'],
  // An idea has no real track until it is promoted to a type.
  idea: ['idea'],
};

export const TYPE_LABELS: Record<ContentType, string> = {
  reel: 'Рілс',
  carousel: 'Карусель',
  story: 'Сторіс',
  idea: 'Ідея',
};

/** Distinct chip colour per type (row component). */
export const TYPE_CHIP_COLORS: Record<ContentType, string> = {
  carousel: '#004BA8', // blue
  reel: '#7A3CE0', // violet
  story: '#E0644A', // coral
  idea: '#9A9A9A', // grey
};

export const PUBLISHED_STATUS: ContentStatus = 'published';

/**
 * Idea stage = outline-only ring, no fill wedge (task 86d3c7mcn, overrides the
 * earlier ~12% sliver spec). Every idea-stage piece renders identically: a faint
 * grey outline, empty inside.
 */
export const IDEA_SLIVER_FRACTION = 0;

export function trackFor(type: ContentType): readonly ContentStatus[] {
  return TYPE_TRACKS[type] ?? TYPE_TRACKS.idea;
}

export function statusLabel(status: ContentStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function statusColor(status: ContentStatus): string {
  return STATUS_COLORS[status] ?? STATUS_COLORS.idea;
}

/** Whether `status` is valid for the given type's track. */
export function isValidStatus(type: ContentType, status: ContentStatus): boolean {
  return trackFor(type).includes(status);
}

/** Index of `status` within its type's track, or -1 if invalid. */
export function statusIndex(type: ContentType, status: ContentStatus): number {
  return trackFor(type).indexOf(status);
}

export function isPublished(status: ContentStatus): boolean {
  return status === PUBLISHED_STATUS;
}

/**
 * Next status when advancing one stage. Returns null at the end of the track,
 * for an unknown status, or for an idea-type piece (which must be promoted to a
 * real type before it can advance).
 */
export function nextStatus(type: ContentType, status: ContentStatus): ContentStatus | null {
  if (type === 'idea') return null;
  const track = trackFor(type);
  const i = track.indexOf(status);
  if (i < 0 || i >= track.length - 1) return null;
  return track[i + 1];
}

/** Previous status, or null at the start / for an unknown status. */
export function prevStatus(type: ContentType, status: ContentStatus): ContentStatus | null {
  const track = trackFor(type);
  const i = track.indexOf(status);
  if (i <= 0) return null;
  return track[i - 1];
}

/**
 * Fraction of the track completed, for the pie-fill ring (0..1).
 * fraction = current stage index / last stage index. An idea-type piece shows a
 * fixed small sliver because it has no real track yet.
 */
export function statusFraction(type: ContentType, status: ContentStatus): number {
  if (type === 'idea') return IDEA_SLIVER_FRACTION;
  const track = trackFor(type);
  const i = track.indexOf(status);
  if (i < 0) return 0;
  if (track.length <= 1) return IDEA_SLIVER_FRACTION;
  return i / (track.length - 1);
}

/**
 * Promote an idea-type piece to a real type: it moves onto that type's track at
 * Скрипт (carrying its content — see auto-save task). Returns the new type +
 * status the caller should persist.
 */
export function promoteIdeaTo(
  type: Exclude<ContentType, 'idea'>,
): { contentType: ContentType; status: ContentStatus } {
  return { contentType: type, status: 'script' };
}
