/**
 * Workshop lessons data source for the Home page "Уроки воркшопу" section.
 *
 * These are the AI-content workshop lessons for founding users. The content
 * lives here (the same YouTube embeds previously inlined in the dashboard) until
 * a dedicated lessons backend exists. Grouped by module; the Home list flattens
 * them into sequential "Урок N" rows.
 *
 * NOTE: there is no per-lesson duration in the source data, so the row subline
 * shows the module name rather than a fabricated "X хв". Swap this array (or
 * point it at a real data source) when lesson metadata becomes available.
 */

export interface WorkshopModule {
  title: string;
  lessons: { label: string; embedUrl: string }[];
}

export const WORKSHOP_MODULES: WorkshopModule[] = [
  {
    title: 'Модуль 1: де брати ідеї та воронка контенту',
    lessons: [
      { label: 'Урок 1', embedUrl: 'https://www.youtube.com/embed/DWELuEoU2OE' },
      { label: 'Урок 2', embedUrl: 'https://www.youtube.com/embed/Um-VOIeE1m4' },
      { label: 'Урок 3', embedUrl: 'https://www.youtube.com/embed/iL7A4mOEaE0' },
      { label: 'Урок 4', embedUrl: 'https://www.youtube.com/embed/HJLP13aqbKc' },
      { label: 'Урок 5', embedUrl: 'https://www.youtube.com/embed/E0IK9fYM3Ow' },
    ],
  },
  {
    title: 'Модуль 2: сторітелінг, вторинна вигода та правило 3 секунд',
    lessons: [
      { label: 'Сторітелінг', embedUrl: 'https://www.youtube.com/embed/nD0PL1rUhTA' },
      { label: 'Вторинна вигода', embedUrl: 'https://www.youtube.com/embed/Rqqqb0u3ynY' },
      { label: 'Правило 3 секунд', embedUrl: 'https://www.youtube.com/embed/CjclYYOm2t8' },
    ],
  },
  {
    title: 'Модуль 3: генерація та клонування',
    lessons: [
      { label: 'Генерація чи клонування', embedUrl: 'https://www.youtube.com/embed/EQIoyQuTXRs' },
      { label: 'Що треба для клона', embedUrl: 'https://www.youtube.com/embed/4zPp-lkSEpw' },
      { label: 'Демо клінг та хігсфілд', embedUrl: 'https://www.youtube.com/embed/QuerXQ1fETg' },
    ],
  },
];

export interface WorkshopLesson {
  /** Stable id ("m0-l1") for keys/testids. */
  id: string;
  /** Sequential lesson number across all modules. */
  index: number;
  /** Lesson title (e.g. "Урок 1" or "Сторітелінг"). */
  title: string;
  /** Module this lesson belongs to (used as the row subline). */
  moduleTitle: string;
  embedUrl: string;
  /** Watch URL opened on tap. */
  watchUrl: string;
}

/** Flattened, sequentially numbered lesson list for the Home list view. */
export function flattenedWorkshopLessons(): WorkshopLesson[] {
  const out: WorkshopLesson[] = [];
  let index = 0;
  WORKSHOP_MODULES.forEach((mod, mi) => {
    mod.lessons.forEach((lesson, li) => {
      index += 1;
      out.push({
        id: `m${mi}-l${li}`,
        index,
        title: lesson.label,
        moduleTitle: mod.title,
        embedUrl: lesson.embedUrl,
        watchUrl: lesson.embedUrl.replace('/embed/', '/watch?v='),
      });
    });
  });
  return out;
}
