import { requireServerEnv } from '@/lib/env';

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

export interface StoriesOutput {
  template_used: 'A' | 'B' | 'C' | 'D';
  template_name: string;
  slides: Slide[];
}

interface GroqResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

type OutputLanguage = 'uk' | 'en';

const VALID_VISUALS: StoryVisual[] = ['Кольоровий фон', 'Говоряча голова', 'Відео в тему', 'Гарне фото'];
const VALID_INTERACTIVE: Exclude<StoryInteractive, null>[] = ['Стікер', 'Тягнулка', 'Опитування', 'Заклик в директ'];

function detectOutputLanguage(rant: string): OutputLanguage {
  const cyr = (rant.match(/[А-Яа-яІіЇїЄєҐґ]/g) ?? []).length;
  const latin = (rant.match(/[A-Za-z]/g) ?? []).length;
  if (latin >= 20 && latin >= cyr * 1.2) return 'en';
  return 'uk';
}

function buildSystemPrompt(outputLanguage: OutputLanguage): string {
  const languageRule =
    outputLanguage === 'en'
      ? 'screen_text пиши природною розмовною англійською.'
      : 'screen_text пиши природньою українською.';

  return `Ти — досвідчений сценарист Instagram Stories для українських блогерів. Ти перетворюєш сирий рент на покроковий сценарій сторіс.

ГОЛОВНИЙ ПРИНЦИП: одна думка — одна сторіс. Не перевантажуй. Кожен слайд = один момент уваги, одна емоція, одна ідея.
Пиши тільки текст кадру для екрану, без озвучки, без сценарію "що говорити".

══════════════════════════════
КРОК 1 — ВИЗНАЧ ШАБЛОН
══════════════════════════════

Прочитай рент і обери ОДИН шаблон зі структурою сторітелінг-дуги:

ШАБЛОН A — "Освітній / Розповідь"
Якщо: автор ділиться досвідом, інсайтом, поясненням.
Структура: Hook/Intrigue → Context (2–3) → Details/Build-up (3–5) → Climax → Resolution → CTA

ШАБЛОН B — "Продаж / Позиціювання"
Сигнали: продукт, послуга, результат клієнта, ціна, консультація.
Структура: Hook/Intrigue → Context (2–3) → Details/Build-up (3–5) → Climax → Resolution → CTA

ШАБЛОН C — "Провокація / Думка"
Сигнали: незгода з трендом, особиста позиція проти загальноприйнятого.
Структура: Hook/Intrigue → Context (2–3) → Details/Build-up (3–5) → Climax → Resolution → CTA

ШАБЛОН D — "Закулісся / Особисте"
Сигнали: особиста ситуація, вразливість, "я нещодавно зрозумів", процес.
Структура: Hook/Intrigue → Context (2–3) → Details/Build-up (3–5) → Climax → Resolution → CTA

══════════════════════════════
КРОК 2 — НАПИШИ СЦЕНАРІЙ
══════════════════════════════

ЖОРСТКІ ПРАВИЛА:

1. ВІДКРИТТЯ (слайд 1) — гачок/інтрига:
   - Слайд 1 має зупиняти перегляд і викликати бажання дізнатися більше.
   - Слайд 1: ЗАВЖДИ visual = "Говоряча голова" або "Відео в тему". Ніколи не фото і не кольоровий фон для першого слайду.
   - Один зі слайдів 2–3: ОБОВ'ЯЗКОВО interactive = "Стікер". Це найлегша взаємодія.
   - Слайд 1 може мати interactive = null або "Стікер" — але не "Заклик в директ".

2. СТРУКТУРА СТОРІТЕЛІНГУ ПО КАДРАХ:
   - Слайди 2–3 = контекст (чому я це розповідаю, що сталося, сетап).
   - Слайди 3–5 = деталі/build-up, які оживляють історію.
   - Окремий слайд = кульмінація ("що буде далі / що я зробив(ла)").
   - Після кульмінації = розв'язка (чим завершилось, що зрозумів(ла), висновок).
   - Останній слайд = CTA за ситуацією ("що б ти зробив(ла)?", "скинь 🔥", "напиши в дірект", "клікни лінк").

3. ОДНА ДУМКА — ОДИН СЛАЙД:
   - screen_text: максимум 1–2 короткі речення. Без заголовків і підзаголовків.
   - Пиши від першої особи, живо, розмовно, як природний внутрішній монолог.
   - Це тільки текст на екрані. Ніякої озвучки, ніяких інструкцій "що сказати в камеру".
   - ${languageRule}
   - Якщо думка велика — розбий на два окремі слайди.
   - Без "[SCENE]", "voiceover:", хештегів і маркетингового жаргону.

4. ВИБІР ВІЗУАЛУ (visual):
   - "Говоряча голова" — автор дивиться в камеру і говорить. Найкраще для особистого, емоційного.
   - "Відео в тему" — б-ролл, контекстне відео без обличчя. Для ситуативних описів.
   - "Гарне фото" — статичне фото автора або з теми. Для більш спокійних, текстових слайдів.
   - "Кольоровий фон" — тільки текст на кольорі. Для коротких тез, цитат, статистики.

5. ВИБІР ІНТЕРАКТИВУ (interactive):
   - "Стікер" — emoji-реакція або question стікер. Легка взаємодія, не потребує зусиль від глядача.
   - "Тягнулка" — слайдер з емодзі. Для емоційної оцінки ("наскільки це про тебе?").
   - "Опитування" — два варіанти відповіді. Для чіткого вибору між двома позиціями.
   - "Заклик в директ" — ТІЛЬКИ на останньому або передостанньому слайді. Це CTA.
   - null — більшість слайдів не мають інтерактиву. Не перестарайся.

6. CTA:
   - Завжди останній слайд.
   - interactive = "Заклик в директ".
   - visual = "Говоряча голова" або "Кольоровий фон".
   - Заклик — в директ або реакція. НІКОЛИ "підпишись" або "постав лайк".

══════════════════════════════
КІЛЬКІСТЬ СЛАЙДІВ
══════════════════════════════

Типово 5–10 слайдів.
Кількість має бути природною для історії: не доповнюй "для кількості" і не обрізай важливий сенс.

══════════════════════════════
ФОРМАТ ВІДПОВІДІ
══════════════════════════════

Відповідай ТІЛЬКИ валідним JSON. Без пояснень, без markdown, без коментарів до або після.

{
  "template_used": "A",
  "template_name": "Освітній / Розповідь",
  "slides": [
    {
      "slide_number": 1,
      "one_thought": "Інтригуюче відкриття — постановка ситуації",
      "screen_text": "Я витратила 3 місяці на те, що можна було зробити за тиждень",
      "visual": "Говоряча голова",
      "interactive": null,
      "notes": "Дивись прямо в камеру, пауза після першого речення"
    },
    {
      "slide_number": 2,
      "one_thought": "Підсилення інтриги — глядач має захотіти знати далі",
      "screen_text": "І найсмішніше — я знала відповідь з самого початку",
      "visual": "Говоряча голова",
      "interactive": "Стікер",
      "notes": "Стікер — питання 'Знайомо?' або серце-реакція"
    }
  ]
}`;
}

function buildUserPrompt(rant: string, outputLanguage: OutputLanguage): string {
  const languageHint =
    outputLanguage === 'en'
      ? 'Усі текстові поля (template_name, one_thought, screen_text, notes) пиши англійською.'
      : 'Усі текстові поля пиши українською.';
  return `Ось рент:

"""
${rant}
"""

Перетвори його на сценарій сторіс за правилами вище.
${languageHint}
Назви visual та interactive залишай лише з дозволеного списку (українськими значеннями).`;
}

function toVisual(value: unknown): StoryVisual {
  if (typeof value === 'string' && VALID_VISUALS.includes(value as StoryVisual)) {
    return value as StoryVisual;
  }
  return 'Говоряча голова';
}

function toInteractive(value: unknown): StoryInteractive {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && VALID_INTERACTIVE.includes(value as Exclude<StoryInteractive, null>)) {
    return value as Exclude<StoryInteractive, null>;
  }
  return null;
}

function normalizeOutput(raw: unknown): StoriesOutput {
  const source = (raw ?? {}) as Partial<StoriesOutput>;
  const template_used = source.template_used && ['A', 'B', 'C', 'D'].includes(source.template_used)
    ? source.template_used
    : 'A';
  const template_name = typeof source.template_name === 'string' && source.template_name.trim()
    ? source.template_name.trim()
    : 'Освітній / Розповідь';

  const incomingSlides = Array.isArray(source.slides) ? source.slides : [];
  const clamped = incomingSlides.slice(0, 9);
  const slidesSeed = clamped.length >= 5 ? clamped : incomingSlides.concat(
    Array.from({ length: Math.max(0, 5 - incomingSlides.length) }, () => ({}) as Slide),
  ).slice(0, 5);

  const slides: Slide[] = slidesSeed.map((slideLike, index) => {
    const slideObj = (slideLike ?? {}) as Partial<Slide>;
    const oneThought = typeof slideObj.one_thought === 'string' && slideObj.one_thought.trim()
      ? slideObj.one_thought.trim()
      : `Слайд ${index + 1}`;
    const screenText = typeof slideObj.screen_text === 'string' && slideObj.screen_text.trim()
      ? slideObj.screen_text.trim()
      : 'Текст на екрані';
    const notes = typeof slideObj.notes === 'string' && slideObj.notes.trim() ? slideObj.notes.trim() : undefined;
    return {
      slide_number: index + 1,
      one_thought: oneThought,
      screen_text: screenText,
      visual: toVisual(slideObj.visual),
      interactive: toInteractive(slideObj.interactive),
      notes,
    };
  });

  if (slides[0] && slides[0].visual !== 'Говоряча голова' && slides[0].visual !== 'Відео в тему') {
    slides[0].visual = 'Говоряча голова';
  }
  if (slides[0] && slides[0].interactive === 'Заклик в директ') {
    slides[0].interactive = null;
  }

  if (slides[1] && slides[2]) {
    const hasStickerIn23 = slides[1].interactive === 'Стікер' || slides[2].interactive === 'Стікер';
    if (!hasStickerIn23) {
      slides[1].interactive = 'Стікер';
    }
  } else if (slides[1] && slides[1].interactive !== 'Стікер') {
    slides[1].interactive = 'Стікер';
  }

  const last = slides[slides.length - 1];
  if (last) {
    last.interactive = 'Заклик в директ';
    if (last.visual !== 'Говоряча голова' && last.visual !== 'Кольоровий фон') {
      last.visual = 'Говоряча голова';
    }
  }

  return { template_used, template_name, slides };
}

/**
 * Генерує структурований сценарій сторіс через Groq (той самий клієнт/модель, що й rant-to-reel).
 */
export async function generateStoriesFromRant(rant: string): Promise<StoriesOutput> {
  const trimmed = rant.trim();
  if (!trimmed) {
    throw new Error('Введи рент перед генерацією.');
  }
  const outputLanguage = detectOutputLanguage(trimmed);

  const apiKey = requireServerEnv('GROQ_API_KEY');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(outputLanguage) },
        { role: 'user', content: buildUserPrompt(trimmed, outputLanguage) },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[rantToStories] Groq error:', response.status, errorText);
    throw new Error('Не вдалося згенерувати сценарій. Спробуй ще раз.');
  }

  const payload = (await response.json()) as GroqResponse;
  const rawText = payload.choices?.[0]?.message?.content?.trim();
  if (!rawText) {
    throw new Error('AI повернув порожню відповідь. Спробуй ще раз.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (parseError) {
    console.error('[rantToStories] invalid JSON:', rawText, parseError);
    throw new Error('AI повернув некоректний формат. Спробуй ще раз.');
  }

  return normalizeOutput(parsed);
}
