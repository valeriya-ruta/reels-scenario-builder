// The locked Modern Elegant taxonomy, as pickable options (labels in Ukrainian).
import type { LabSlideType, LabSubtype, LabPicturePosition, LabVariant } from './types';

export type SubtypeOption = {
  subtype: LabSubtype;
  label: string;
  /** Text slides expose picture position; others don't. */
  picturePositions?: LabPicturePosition[];
  variants?: { id: LabVariant; label: string }[];
  /** Not fidelity-verified (no source SVG) — flagged in UI/report. */
  unverified?: boolean;
};

export type TypeOption = {
  type: LabSlideType;
  label: string;
  subtypes: SubtypeOption[];
};

export const CATALOG: TypeOption[] = [
  {
    type: 'cover',
    label: 'Обкладинка',
    subtypes: [
      { subtype: 'title', label: 'Тільки заголовок' },
      { subtype: 'title_subtext', label: 'Заголовок + підзаголовок' },
    ],
  },
  {
    type: 'text',
    label: 'Текст',
    subtypes: [
      { subtype: 'paragraph', label: 'Заголовок + абзац', picturePositions: ['none', 'up', 'down', 'middle'] },
      { subtype: 'bullets', label: 'Заголовок + список', picturePositions: ['none', 'up', 'down', 'middle'] },
      { subtype: 'numbered', label: 'Заголовок + нумерований', picturePositions: ['none', 'up', 'down', 'middle'] },
    ],
  },
  {
    type: 'numbers',
    label: 'Цифри',
    subtypes: [
      {
        subtype: 'stat',
        label: 'Показник + підпис',
        variants: [
          { id: 'stat_large', label: 'Велика цифра' },
          { id: 'stat_small', label: 'Менша цифра' },
        ],
      },
    ],
  },
  {
    type: 'cta',
    label: 'Заклик (CTA)',
    subtypes: [
      { subtype: 'keyword', label: 'Ключове слово' },
      { subtype: 'icons', label: 'Дія + іконки' },
    ],
  },
  {
    type: 'testimonial',
    label: 'Скриншот / Відгук',
    subtypes: [
      { subtype: 'screenshot', label: 'Текстовий відгук (скриншот)' },
      { subtype: 'before_after', label: 'До / Після' },
      {
        subtype: 'point_ab',
        label: 'Точка А → Б',
        variants: [
          { id: 'diagonal', label: 'Діагональ' },
          { id: 'stacked', label: 'Смуги' },
        ],
      },
    ],
  },
];

export const PICTURE_POSITION_LABEL: Record<LabPicturePosition, string> = {
  none: 'Без фото',
  up: 'Фото зверху',
  down: 'Фото знизу',
  middle: 'Фото по центру',
};

export function typeOption(type: LabSlideType): TypeOption | undefined {
  return CATALOG.find((t) => t.type === type);
}
export function subtypeOption(type: LabSlideType, subtype: LabSubtype): SubtypeOption | undefined {
  return typeOption(type)?.subtypes.find((s) => s.subtype === subtype);
}
