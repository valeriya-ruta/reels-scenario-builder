import type {
  LabSlide,
  LabSlideType,
  LabSubtype,
  LabPicturePosition,
  LabVariant,
  LabProject,
} from './types';

let counter = 0;
function id(): string {
  // deterministic-ish unique id without Date.now (SSR-safe)
  counter += 1;
  return `labslide_${counter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createSlide(
  type: LabSlideType,
  subtype: LabSubtype,
  opts: { picturePosition?: LabPicturePosition; variant?: LabVariant } = {},
): LabSlide {
  return {
    id: id(),
    type,
    subtype,
    picturePosition: opts.picturePosition ?? 'none',
    variant: opts.variant ?? (subtype === 'stat' ? 'stat_large' : subtype === 'point_ab' ? 'diagonal' : 'default'),
    title: '',
    body: '',
    bodyAfter: '',
    bullets: [],
    statValue: '',
    ctaKeyword: '',
    points: [
      { label: 'Точка А:', text: '' },
      { label: 'Точка Б:', text: '' },
    ],
    images: [],
  };
}

/** A fresh project with a sensible cover. */
export function createProjectSlides(): LabSlide[] {
  return [createSlide('cover', 'title_subtext')];
}

// ── Sample content mirroring each Figma reference (for the fidelity harness) ──
// Keyed by the reference PNG basename so the diff harness can pair them.
export const SAMPLE_SLIDES: { key: string; ref: string; slide: LabSlide }[] = [
  {
    key: 'cover-title',
    ref: 'title only.png',
    slide: { ...createSlide('cover', 'title'), title: 'Як я обираю SPF' },
  },
  {
    key: 'cover-title-subtext',
    ref: 'title + text.png',
    slide: {
      ...createSlide('cover', 'title_subtext'),
      title: 'Як я обираю SPF',
      body: '7 порад від натуропата, щоб обрати найкращий СПФ для себе та родини',
    },
  },
  {
    key: 'text-paragraph',
    ref: 'title+text.png',
    slide: {
      ...createSlide('text', 'paragraph'),
      title: 'Якщо SPF неприємний, користуватися ним ви не будете',
      body: 'Я можу скільки завгодно читати склад.\n\nАле якщо крем липкий, вибілює шкіру, скочується або погано поводиться під макіяжем, рука до нього просто не потягнеться.\n\nТому комфорт для мене — теж частина ефективності.',
    },
  },
  {
    key: 'text-bullets',
    ref: 'title+bullets.png',
    slide: {
      ...createSlide('text', 'bullets'),
      title: 'Завжди переглядаю склад',
      body: 'Є компоненти, на які я звертаю увагу насамперед:',
      bullets: ['Oxybenzone', 'Octinoxate', 'Octocrylene', 'Homosalate', 'BHT', 'Велика кількість ароматизаторів', 'Мікропластик, якщо є краща альтернатива'],
      bodyAfter: 'Навколо деяких із цих компонентів досі тривають дискусії щодо їхньої безпечності та впливу на довкілля. Саме тому, коли є хороший SPF без них, я обираю його',
    },
  },
  {
    key: 'text-numbered',
    ref: 'title+numbers.png',
    slide: {
      ...createSlide('text', 'numbered'),
      title: 'Завжди переглядаю склад',
      body: 'Є компоненти, на які я звертаю увагу насамперед:',
      bullets: ['Oxybenzone', 'Octinoxate', 'Octocrylene', 'Homosalate', 'BHT', 'Велика кількість ароматизаторів', 'Мікропластик, якщо є краща альтернатива'],
      bodyAfter: 'Навколо деяких із цих компонентів досі тривають дискусії щодо їхньої безпечності та впливу на довкілля. Саме тому, коли є хороший SPF без них, я обираю його',
    },
  },
  {
    key: 'numbers-stat',
    ref: 'stat+label.png',
    slide: {
      ...createSlide('numbers', 'stat', { variant: 'stat_large' }),
      statValue: '15.000$',
      body: 'Саме стільки ми заробили на нашому запуску, який зробили без реклами',
    },
  },
  {
    key: 'numbers-stat-small',
    ref: 'stat+label v2 (smaller number).png',
    slide: {
      ...createSlide('numbers', 'stat', { variant: 'stat_small' }),
      statValue: '15.000$',
      body: 'Саме стільки ми заробили на нашому запуску, який зробили без реклами',
    },
  },
  {
    key: 'cta-keyword',
    ref: 'CTA with keyword.png',
    slide: {
      ...createSlide('cta', 'keyword'),
      title: 'Напиши в коментарі',
      ctaKeyword: 'Дієта',
      body: 'Щоб отримати безкоштовний гайд з готовими інструкціями та рецептами!',
    },
  },
  {
    key: 'cta-icons',
    ref: 'CTA with icons.png',
    slide: {
      ...createSlide('cta', 'icons'),
      title: 'Збережи, щоб не загубити',
      body: 'Яким СПФ користуєшся ти? Пиши в коментарі!',
    },
  },
  {
    key: 'testimonial-screenshot',
    ref: 'screenshot.png',
    slide: {
      ...createSlide('testimonial', 'screenshot'),
      title: 'Відгук клієнтки:',
      body: 'Саме стільки ми заробили на нашому запуску, який зробили без реклами',
      images: [{}],
    },
  },
  {
    key: 'testimonial-before-after',
    ref: 'after.png',
    slide: {
      ...createSlide('testimonial', 'before_after'),
      title: 'До та після:',
      body: 'До роботи клієнтка важила 100 кг, тепер вона важить лише 50 кг без дієт!',
      images: [{}, {}],
    },
  },
  {
    key: 'testimonial-point-ab',
    ref: 'point A_B v2.png',
    slide: {
      ...createSlide('testimonial', 'point_ab', { variant: 'diagonal' }),
      points: [
        { label: 'Точка А:', text: 'До роботи клієнтка важила 100 кг, тепер вона важить лише 50 кг без дієт!' },
        { label: 'Точка Б:', text: 'До роботи клієнтка важила 100 кг, тепер вона важить лише 50 кг без дієт!' },
      ],
      images: [{}, {}],
    },
  },
  {
    key: 'text-paragraph-image-up',
    ref: 'title+text+image up.png',
    slide: {
      ...createSlide('text', 'paragraph', { picturePosition: 'up' }),
      title: 'Якщо SPF неприємний, користуватися ви не будете',
      body: 'Я можу скільки завгодно читати склад.\n\nАле якщо крем липкий, вибілює шкіру, скочується або погано поводиться під макіяжем, рука до нього просто не потягнеться.',
      images: [{}],
    },
  },
  {
    key: 'text-paragraph-image-down',
    ref: 'title+text+image down.png',
    slide: {
      ...createSlide('text', 'paragraph', { picturePosition: 'down' }),
      title: 'Якщо SPF неприємний, користуватися ви не будете',
      body: 'Я можу скільки завгодно читати склад.\n\nАле якщо крем липкий, вибілює шкіру, скочується або погано поводиться під макіяжем.',
      images: [{}],
    },
  },
  {
    key: 'text-bullets-image-up',
    ref: 'title+bullets+image up.png',
    slide: {
      ...createSlide('text', 'bullets', { picturePosition: 'up' }),
      title: 'Завжди переглядаю склад',
      bullets: ['Oxybenzone', 'Octinoxate', 'Octocrylene', 'Homosalate'],
      images: [{}],
    },
  },
  {
    key: 'text-bullets-image-down',
    ref: 'title+bullets+image down.png',
    slide: {
      ...createSlide('text', 'bullets', { picturePosition: 'down' }),
      title: 'Завжди переглядаю склад',
      bullets: ['Oxybenzone', 'Octinoxate', 'Octocrylene', 'Homosalate'],
      images: [{}],
    },
  },
  {
    key: 'text-numbered-image-up',
    ref: 'title+numbers+image up.png',
    slide: {
      ...createSlide('text', 'numbered', { picturePosition: 'up' }),
      title: 'Завжди переглядаю склад',
      bullets: ['Oxybenzone', 'Octinoxate', 'Octocrylene', 'Homosalate'],
      images: [{}],
    },
  },
  {
    key: 'text-numbered-image-down',
    ref: 'title+numbers+image down.png',
    slide: {
      ...createSlide('text', 'numbered', { picturePosition: 'down' }),
      title: 'Завжди переглядаю склад',
      bullets: ['Oxybenzone', 'Octinoxate', 'Octocrylene', 'Homosalate'],
      images: [{}],
    },
  },
];

export function newProject(name = 'Нова карусель'): LabProject {
  return { id: '', name, styleId: 'modern-elegant', slides: createProjectSlides() };
}
