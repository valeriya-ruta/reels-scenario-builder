import type { LabSlide } from './types';
import { createSlide } from './defaults';
import { WIDE_IMAGE_B64, TALL_IMAGE_B64 } from './demoImages';

const LONG = 'Дуже довгий текст який навмисно перевищує розумні межі щоб перевірити що переповнення не ламає розкладку а лише переноситься чи обрізається без виходу за межі полотна та накладання елементів один на одного під час рендеру';

// Empty-state, max-length overflow, image-fit and Cyrillic edge cases.
// These have no Figma reference — they prove robustness, not pixel-fidelity.
export const EXTRA_SAMPLES: { key: string; slide: LabSlide; note: string }[] = [
  { key: 'empty-cover', note: 'Empty cover renders (no text)', slide: { ...createSlide('cover', 'title_subtext') } },
  { key: 'empty-bullets', note: 'Empty bullets slide renders', slide: { ...createSlide('text', 'bullets') } },
  { key: 'empty-screenshot', note: 'Screenshot empty → placeholder frame', slide: { ...createSlide('testimonial', 'screenshot'), title: 'Відгук клієнтки:', images: [{}] } },
  {
    key: 'overflow-cover',
    note: 'Max-length cover title wraps, no break',
    slide: { ...createSlide('cover', 'title_subtext'), title: LONG, body: LONG },
  },
  {
    key: 'overflow-bullets',
    note: 'Overflowing bullets stay in-canvas',
    slide: {
      ...createSlide('text', 'bullets'),
      title: LONG,
      body: LONG,
      bullets: Array.from({ length: 7 }, (_, i) => `Пункт ${i + 1} — ${LONG}`),
      bodyAfter: LONG,
    },
  },
  {
    key: 'fit-screenshot-contain',
    note: 'Screenshot WIDE image → contain (whole circle visible, letterboxed on bg)',
    slide: {
      ...createSlide('testimonial', 'screenshot'),
      title: 'Відгук клієнтки:',
      body: 'Contain-fit: зображення не обрізається',
      images: [{ base64: WIDE_IMAGE_B64, aspect: 3 }],
    },
  },
  {
    key: 'fit-before-after-cover',
    note: 'Before/After TALL+WIDE → cover (identical crop rules)',
    slide: {
      ...createSlide('testimonial', 'before_after'),
      title: 'До та після:',
      body: 'Cover-fit: обидва кадри обрізані однаково',
      images: [{ base64: TALL_IMAGE_B64, aspect: 1 / 3 }, { base64: WIDE_IMAGE_B64, aspect: 3 }],
    },
  },
  {
    key: 'fit-text-image-up-cover',
    note: 'Text image-up WIDE → cover (full-bleed top half)',
    slide: {
      ...createSlide('text', 'paragraph', { picturePosition: 'up' }),
      title: 'Заголовок під фото',
      body: 'Фото зверху займає верхню половину, cover-fit.',
      images: [{ base64: WIDE_IMAGE_B64, aspect: 3 }],
    },
  },
  {
    key: 'fit-reposition',
    note: 'Image pan+zoom within slot (scale 1.6, panned right)',
    slide: {
      ...createSlide('text', 'paragraph', { picturePosition: 'up' }),
      title: 'Розташування фото',
      body: 'Фото збільшене і зсунуте вправо.',
      images: [{ base64: WIDE_IMAGE_B64, aspect: 3, transform: { tx: 0.18, ty: 0, scale: 1.6 } }],
    },
  },
  {
    key: 'cyrillic-ukrainian',
    note: 'Ukrainian Cyrillic incl. Ґ Є І Ї renders (not tofu)',
    slide: { ...createSlide('cover', 'title_subtext'), title: 'ҐРУНТ ЄДНІСТЬ ЇЖА', body: 'Її ґанок іє їхній — ЄІЇҐ works' },
  },
];
