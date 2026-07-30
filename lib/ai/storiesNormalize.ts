/**
 * Pure normalization + types for the storytelling engine (task 86d3gp8tb).
 *
 * Kept import-free (no server deps, no path aliases) so the single-vs-saga
 * mapping, per-day voice constraints and CTA placement can be unit-tested
 * directly from a Playwright spec without booting the app or hitting Groq.
 */

export type StoryVisual = 'Кольоровий фон' | 'Говоряча голова' | 'Відео в тему' | 'Гарне фото';
export type StoryInteractive = 'Стікер' | 'Тягнулка' | 'Опитування' | 'Заклик в директ' | null;

export interface Slide {
  slide_number: number;
  one_thought: string;
  screen_text: string;
  visual: StoryVisual;
  interactive: StoryInteractive;
  notes?: string;
}

/**
 * One storytelling "day". A single story is a StoriesOutput with exactly one day;
 * a saga has several. Each day is rendered as its own column downstream, so no
 * new saga UI is required (the storytelling board already renders N columns).
 */
export interface StoryDay {
  day_number: number;
  /** Column title, e.g. "День 1 — лайфстайл" or the single-story template name. */
  title: string;
  /** Which прогрів barrier / role this day plays (saga only). Informational. */
  goal?: string;
  slides: Slide[];
}

export interface StoriesOutput {
  // Back-compat fields (consumed by /stories preview page + StoriesResult).
  template_used: 'A' | 'B' | 'C' | 'D';
  template_name: string;
  slides: Slide[];
  // Engine v2 (master prompt) fields.
  mode: 'single' | 'saga';
  /** First-person one-liner the app can surface, e.g. "Тут забагато для однієї — зробила сагу на 4 дні". */
  reason: string;
  /** Saga only: 'A' = без кейсів, 'B' = з кейсами. null for single. */
  cases_variant: 'A' | 'B' | null;
  days: StoryDay[];
}

export const VALID_VISUALS: StoryVisual[] = ['Кольоровий фон', 'Говоряча голова', 'Відео в тему', 'Гарне фото'];
export const VALID_INTERACTIVE: Exclude<StoryInteractive, null>[] = [
  'Стікер',
  'Тягнулка',
  'Опитування',
  'Заклик в директ',
];

export function toVisual(value: unknown): StoryVisual {
  if (typeof value === 'string' && VALID_VISUALS.includes(value as StoryVisual)) {
    return value as StoryVisual;
  }
  return 'Говоряча голова';
}

export function toInteractive(value: unknown): StoryInteractive {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && VALID_INTERACTIVE.includes(value as Exclude<StoryInteractive, null>)) {
    return value as Exclude<StoryInteractive, null>;
  }
  return null;
}

function normalizeSlides(rawSlides: unknown, startNumber: number): Slide[] {
  const incoming = Array.isArray(rawSlides) ? rawSlides : [];
  const clamped = incoming.slice(0, 10);
  const seed =
    clamped.length >= 3
      ? clamped
      : incoming
          .concat(Array.from({ length: Math.max(0, 3 - incoming.length) }, () => ({}) as Slide))
          .slice(0, 3);

  const slides: Slide[] = seed.map((slideLike, index) => {
    const slideObj = (slideLike ?? {}) as Partial<Slide>;
    const oneThought =
      typeof slideObj.one_thought === 'string' && slideObj.one_thought.trim()
        ? slideObj.one_thought.trim()
        : `Слайд ${startNumber + index}`;
    const screenText =
      typeof slideObj.screen_text === 'string' && slideObj.screen_text.trim()
        ? slideObj.screen_text.trim()
        : 'Текст на екрані';
    const notes = typeof slideObj.notes === 'string' && slideObj.notes.trim() ? slideObj.notes.trim() : undefined;
    return {
      slide_number: startNumber + index,
      one_thought: oneThought,
      screen_text: screenText,
      visual: toVisual(slideObj.visual),
      interactive: toInteractive(slideObj.interactive),
      notes,
    };
  });

  // Per-day voice constraints (hook slide + early sticker). The hard CTA is
  // applied globally by the caller so it only lands on the very last slide.
  if (slides[0] && slides[0].visual !== 'Говоряча голова' && slides[0].visual !== 'Відео в тему') {
    slides[0].visual = 'Говоряча голова';
  }
  if (slides[0] && slides[0].interactive === 'Заклик в директ') {
    slides[0].interactive = null;
  }
  if (slides[1] && slides[2]) {
    const hasSticker = slides[1].interactive === 'Стікер' || slides[2].interactive === 'Стікер';
    if (!hasSticker) slides[1].interactive = 'Стікер';
  } else if (slides[1] && slides[1].interactive !== 'Стікер') {
    slides[1].interactive = 'Стікер';
  }

  return slides;
}

export function normalizeOutput(raw: unknown): StoriesOutput {
  const source = (raw ?? {}) as Record<string, unknown>;

  const mode: 'single' | 'saga' = source.mode === 'saga' ? 'saga' : 'single';
  const reason =
    typeof source.reason === 'string' && source.reason.trim()
      ? source.reason.trim()
      : mode === 'saga'
        ? 'Тут вистачає на кілька днів — зробила сагу.'
        : 'Одна думка — одна історія.';
  const cases_variant =
    source.cases_variant === 'A' || source.cases_variant === 'B'
      ? (source.cases_variant as 'A' | 'B')
      : null;

  const template_used =
    typeof source.template_used === 'string' && ['A', 'B', 'C', 'D'].includes(source.template_used)
      ? (source.template_used as StoriesOutput['template_used'])
      : 'A';
  const template_name =
    typeof source.template_name === 'string' && source.template_name.trim()
      ? source.template_name.trim()
      : 'Сторітел з брандампу';

  // Accept either the new days[] shape or a legacy flat slides[] shape.
  let rawDays: unknown[] = Array.isArray(source.days) ? source.days : [];
  if (rawDays.length === 0 && Array.isArray(source.slides)) {
    rawDays = [{ day_number: 1, title: template_name, slides: source.slides }];
  }
  if (rawDays.length === 0) {
    rawDays = [{ day_number: 1, title: template_name, slides: [] }];
  }

  let running = 1;
  const days: StoryDay[] = rawDays.slice(0, 7).map((dayLike, dayIdx) => {
    const dayObj = (dayLike ?? {}) as Record<string, unknown>;
    const slides = normalizeSlides(dayObj.slides, running);
    running += slides.length;
    const title =
      typeof dayObj.title === 'string' && dayObj.title.trim()
        ? dayObj.title.trim()
        : mode === 'saga'
          ? `День ${dayIdx + 1}`
          : template_name;
    const goal = typeof dayObj.goal === 'string' && dayObj.goal.trim() ? dayObj.goal.trim() : undefined;
    return { day_number: dayIdx + 1, title, goal, slides };
  });

  // Hard CTA (Заклик в директ) belongs ONLY at the very end. Strip it everywhere
  // first (a saga's earlier days must end on cliffhangers, not a cold sell),
  // then plant it on the final slide of the final day.
  for (const d of days) {
    for (const s of d.slides) {
      if (s.interactive === 'Заклик в директ') s.interactive = null;
    }
  }
  const lastDay = days[days.length - 1];
  const lastSlide = lastDay?.slides[lastDay.slides.length - 1];
  if (lastSlide) {
    lastSlide.interactive = 'Заклик в директ';
    if (lastSlide.visual !== 'Говоряча голова' && lastSlide.visual !== 'Кольоровий фон') {
      lastSlide.visual = 'Говоряча голова';
    }
  }

  const flatSlides = days
    .flatMap((d) => d.slides)
    .map((slide, index) => ({ ...slide, slide_number: index + 1 }));

  return { template_used, template_name, slides: flatSlides, mode, reason, cases_variant, days };
}
