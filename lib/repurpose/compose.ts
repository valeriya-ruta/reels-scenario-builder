import {
  REPURPOSE_SOURCES,
  REPURPOSE_TARGETS,
  type RepurposeSourceKind,
  type RepurposeTarget,
} from '@/lib/repurpose/types';

/**
 * The repurposing brief — the ONE place the source material is framed for a
 * generator.
 *
 * The app already owns a strong prompt per output format (carousel / reel /
 * storytelling), each of which expects a raw "rant" as its user message. A
 * repurpose is that same call with a different raw material: someone's already
 * published post instead of a fresh braindump. So rather than forking three
 * prompts, this builds the rant those prompts read — source, author, format
 * intent, and the original text — and lets each format's own prompt do what it
 * is already good at.
 *
 * That is also why this file is pure and separate: when the dedicated
 * repurposing prompts land (only the carousel one exists so far), they replace
 * the framing HERE and every format inherits it at once.
 */

export interface RepurposeBriefInput {
  kind: RepurposeSourceKind;
  target: RepurposeTarget;
  sourceUrl: string;
  /** @handle of the original author, when the scraper returned one. */
  author?: string | null;
  /** Transcript (video sources) or post text (Threads), already user-editable. */
  text: string;
  /** Caption / on-post text that came with a video, when there is one. */
  caption?: string | null;
}

/** Hard cap so a long transcript can never blow the model's context. */
const MAX_SOURCE_CHARS = 12_000;
const MAX_CAPTION_CHARS = 1_200;

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max).trimEnd()}…`;
}

function targetLine(target: RepurposeTarget): string {
  switch (target) {
    case 'carousel':
      return 'Новий формат: КАРУСЕЛЬ для Instagram.';
    case 'reels':
      return 'Новий формат: СЦЕНАРІЙ РІЛСУ (відео на 30–90 секунд).';
    case 'stories':
      return 'Новий формат: СТОРІТЕЛІНГ у сторіс.';
    case 'threads':
      return 'Новий формат: ТЕКСТОВИЙ ПОСТ (тред) у Threads.';
  }
}

/**
 * The rules that make this a repurpose and not a re-post. Kept short on purpose:
 * each format's own prompt is long and opinionated already, and a second wall of
 * instructions in the user message competes with it.
 */
function rules(kind: RepurposeSourceKind): string {
  const lines = [
    '- Це НЕ переклад і не переказ слово в слово. Візьми головну думку, аргументи й голос автора — і збери їх заново під новий формат.',
    '- Не вигадуй фактів, цифр, імен і кейсів, яких немає в оригіналі. Якщо чогось бракує — залиш чесний плейсхолдер у [дужках].',
    '- Пиши мовою оригіналу.',
    '- Те, що працювало лише у старому форматі (звертання «дивись на екран», музика, монтажні підказки), — прибирай.',
  ];
  if (kind !== 'threads') {
    lines.push(
      '- Нижче автоматична транскрипція мовлення: дрібні помилки розпізнавання ігноруй, орієнтуйся на зміст.',
    );
  }
  return lines.join('\n');
}

/**
 * Build the user message handed to a format generator.
 *
 * Shape mirrors the braindump's «Кут подачі: …» prefix — a short directive block
 * followed by the raw material — because that is the shape every generator in
 * the app already handles well.
 */
export function composeRepurposeBrief(input: RepurposeBriefInput): string {
  const source = REPURPOSE_SOURCES[input.kind];
  const author = input.author?.trim();
  const caption = input.caption?.trim();

  const header = [
    `РЕПУРПОСИНГ: нижче — вже опублікований пост (${source.label}). Перероби його в новий формат.`,
    targetLine(input.target),
    '',
    'ПРАВИЛА:',
    rules(input.kind),
    '',
    `Джерело: ${input.sourceUrl}`,
    author ? `Автор оригіналу: ${author.startsWith('@') ? author : `@${author}`}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const body = [
    '',
    'ОРИГІНАЛ:',
    '"""',
    clip(input.text, MAX_SOURCE_CHARS),
    '"""',
  ];

  if (caption) {
    body.push('', 'ПІДПИС ПІД ОРИГІНАЛОМ:', '"""', clip(caption, MAX_CAPTION_CHARS), '"""');
  }

  return `${header}\n${body.join('\n')}`;
}

/**
 * Name proposed for the piece before its generator produces a real title —
 * used as the storytelling's «емоційна ціль» slot and as the fallback label in
 * the receipt.
 */
export function repurposeName(kind: RepurposeSourceKind, target: RepurposeTarget): string {
  return `${REPURPOSE_TARGETS[target].label} з ${REPURPOSE_SOURCES[kind].label}`;
}

/** Title stored on the saved source idea, so the dump reads as what it is. */
export function repurposeSourceTitle(kind: RepurposeSourceKind, author?: string | null): string {
  const handle = author?.trim();
  const who = handle ? ` · ${handle.startsWith('@') ? handle : `@${handle}`}` : '';
  return `Переробка: ${REPURPOSE_SOURCES[kind].label}${who}`.slice(0, 120);
}
