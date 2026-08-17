/**
 * Presets — a reel's shape, dropped in as blocks you then write into.
 *
 * A preset is NOT a mode. It writes ordinary blocks and then gets out of the
 * way: every one of them can be retyped, reordered, deleted, or swapped for
 * another kind afterwards. That is the whole reason blocks replaced the old
 * rigid scene — a preset that locked the reel into a shape would put the
 * rigidity straight back.
 *
 * Each block carries its own `hint`, which seeds the placeholder in the builder,
 * so an empty preset still reads as instructions rather than as empty boxes.
 */

import type { AssetKind, AudioSource, BlockKind } from '@/lib/reels/blocks';

export type PresetBlock = {
  kind: BlockKind;
  speaker?: string;
  audioSource?: AudioSource;
  assetKind?: AssetKind;
  /** Placeholder shown in the empty block — what to write here. */
  hint?: string;
  /** Pre-filled record note, when the preset implies one. */
  recordNote?: string;
};

export type ReelPreset = {
  id: string;
  label: string;
  /** One line: when you would reach for this. */
  hint: string;
  blocks: PresetBlock[];
};

export const REEL_PRESETS: ReelPreset[] = [
  {
    id: 'yap',
    label: 'Говорилка',
    hint: 'Хук → думка → висновок, все в камеру',
    blocks: [
      { kind: 'talk', hint: 'Хук — перші 3 секунди, чому це не можна проґавити' },
      { kind: 'talk', hint: 'Основна думка' },
      { kind: 'talk', hint: 'Висновок або заклик' },
    ],
  },
  {
    id: 'yap-broll',
    label: 'Говорилка з перебивками',
    hint: 'Говорю, а зверху перебивки — голос не переривається',
    blocks: [
      { kind: 'talk', hint: 'Хук у камеру' },
      {
        kind: 'broll',
        assetKind: 'film',
        audioSource: 'voiceover',
        hint: 'Що показуємо, поки голос продовжується',
      },
      { kind: 'talk', hint: 'Повертаюсь у кадр' },
      { kind: 'talk', hint: 'Заклик' },
    ],
  },
  {
    id: 'dialogue',
    label: 'Діалог',
    hint: 'Двоє говорять по черзі',
    blocks: [
      { kind: 'dialogue', speaker: 'Я', hint: 'Перша репліка' },
      { kind: 'dialogue', speaker: 'Вона', hint: 'Відповідь' },
      { kind: 'dialogue', speaker: 'Я', hint: 'Друга репліка' },
      { kind: 'dialogue', speaker: 'Вона', hint: 'Фінальна відповідь' },
    ],
  },
  {
    id: 'trend',
    label: 'Тренд: текст + нарізка',
    hint: 'Нічого не кажу — напис на екрані і кадри під трендовий звук',
    blocks: [
      { kind: 'sound', hint: 'Який трендовий звук — посилання або назва' },
      { kind: 'text', audioSource: 'trend', hint: 'Перший напис на екрані' },
      { kind: 'broll', assetKind: 'film', audioSource: 'trend', hint: 'Кадр під цей напис' },
      { kind: 'text', audioSource: 'trend', hint: 'Другий напис' },
      { kind: 'broll', assetKind: 'film', audioSource: 'trend', hint: 'Кадр під другий напис' },
    ],
  },
  {
    id: 'before-after',
    label: 'Було / стало',
    hint: 'Контраст двома кадрами',
    blocks: [
      { kind: 'text', hint: 'Напис «Було»' },
      { kind: 'broll', assetKind: 'find', audioSource: 'trend', hint: 'Старий кадр — знайти в архіві' },
      { kind: 'text', hint: 'Напис «Стало»' },
      { kind: 'broll', assetKind: 'film', audioSource: 'trend', hint: 'Новий кадр — зняти' },
      { kind: 'talk', hint: 'Коротко в камеру: як я до цього дійшла' },
    ],
  },
];

export function findPreset(id: string): ReelPreset | null {
  return REEL_PRESETS.find((p) => p.id === id) ?? null;
}
