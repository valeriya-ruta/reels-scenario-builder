import type { ContentStatus } from '@/lib/content/statusSystem';

/**
 * Auto-save rule (Status system 5/8 — task 86d3btmnr), encoded once so every
 * editor applies it identically.
 *
 * Locked rule:
 *   • Save trigger = ANY real content exists. Empty = discard.
 *   • Only RAW inputs so far (a name, a dumped thought, a reference link /
 *     transcription) → status stays at Ідея on the type's track.
 *   • AUTHORED work (a written script line, real slide content) → Скрипт.
 */
export type ContentSignals = {
  /** A non-empty user name/title. */
  hasName?: boolean;
  /** Raw inputs: a dumped thought, a reference link and/or its transcription. */
  hasRawInput?: boolean;
  /** Authored work: written script text, real slide content. */
  hasAuthoredWork?: boolean;
};

export type AutoSaveDecision =
  | { save: false }
  | { save: true; status: Extract<ContentStatus, 'idea' | 'script'> };

/** Decide whether to persist a piece and, if so, at Ідея or Скрипт. */
export function decideAutoSave(signals: ContentSignals): AutoSaveDecision {
  if (signals.hasAuthoredWork) return { save: true, status: 'script' };
  if (signals.hasName || signals.hasRawInput) return { save: true, status: 'idea' };
  return { save: false };
}

function nonEmpty(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

const DEFAULT_NAMES = new Set(['', 'без назви', 'нова карусель']);
function isUserNamed(name: string | null | undefined): boolean {
  return nonEmpty(name) && !DEFAULT_NAMES.has((name ?? '').trim().toLowerCase());
}

type CarouselSlideLike = {
  title?: string | null;
  body?: string | null;
  listItems?: string[] | null;
  backgroundImageUrl?: string | null;
  backgroundImageBase64?: string | null;
  backgroundType?: string | null;
};

/**
 * Carousel: a name or an added slide → Ідея; a slide with real authored content
 * (title/body/list text or a chosen photo) → Скрипт. A pristine blank editor
 * (no name, only an untouched default slide) → discard.
 */
export function carouselSignals(name: string | null | undefined, slides: CarouselSlideLike[]): ContentSignals {
  const hasName = isUserNamed(name);
  const hasAuthoredWork = slides.some(
    (s) =>
      nonEmpty(s.title) ||
      nonEmpty(s.body) ||
      (Array.isArray(s.listItems) && s.listItems.some(nonEmpty)) ||
      (s.backgroundType === 'image' && (nonEmpty(s.backgroundImageUrl) || nonEmpty(s.backgroundImageBase64))),
  );
  // More than the single default slide counts as a raw input (the user built structure).
  const hasRawInput = slides.length > 1;
  return { hasName, hasRawInput, hasAuthoredWork };
}

/**
 * Reel: a reference link / transcription is a raw input → Ідея; once scenes carry
 * user-authored script text → Скрипт.
 */
export function reelSignals(
  project: { name?: string | null; reference_url?: string | null; reference_note?: string | null },
  scenes: { description?: string | null; dialogue?: string | null; script?: string | null }[],
): ContentSignals {
  const hasName = isUserNamed(project.name);
  const hasRawInput = nonEmpty(project.reference_url) || nonEmpty(project.reference_note);
  const hasAuthoredWork = scenes.some(
    (s) => nonEmpty(s.script) || nonEmpty(s.dialogue) || nonEmpty(s.description),
  );
  return { hasName, hasRawInput, hasAuthoredWork };
}

/** Story: a name → Ідея; real story content → Скрипт. */
export function storySignals(name: string | null | undefined, hasRealContent: boolean): ContentSignals {
  return { hasName: isUserNamed(name), hasAuthoredWork: hasRealContent };
}
