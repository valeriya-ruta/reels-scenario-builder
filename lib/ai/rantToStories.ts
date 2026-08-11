import { requireServerEnv } from '@/lib/env';
import { GROQ_TEXT_MODEL } from '@/lib/ai/groqModel';
import { normalizeOutput } from '@/lib/ai/storiesNormalize';
import type { StoriesOutput } from '@/lib/ai/storiesNormalize';

// Re-export the engine types from their pure home so existing consumers that
// import them from '@/lib/ai/rantToStories' keep working unchanged.
export type {
  StoryVisual,
  StoryInteractive,
  Slide,
  StoryDay,
  StoriesOutput,
} from '@/lib/ai/storiesNormalize';

interface GroqResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

export type OutputLanguage = 'uk' | 'en';

export function detectOutputLanguage(rant: string): OutputLanguage {
  const cyr = (rant.match(/[А-Яа-яІіЇїЄєҐґ]/g) ?? []).length;
  const latin = (rant.match(/[A-Za-z]/g) ?? []).length;
  if (latin >= 20 && latin >= cyr * 1.2) return 'en';
  return 'uk';
}

/**
 * The master storytelling prompt (task 86d3gp8tb). This is Ruta's spec prompt —
 * single-vs-saga detection, the 4-barrier прогрів spine, her voice rules and the
 * honest-placeholder rules — adapted to emit STRUCTURED JSON so the app can
 * persist each day as a column and each сторіс as a card. The только change from
 * the spec's paste-in text is the output contract (JSON instead of free text);
 * every content rule is preserved verbatim.
 */
export function buildSystemPrompt(outputLanguage: OutputLanguage): string {
  const languageRule =
    outputLanguage === 'en'
      ? 'Усі текстові поля (title, one_thought, screen_text, notes, reason) пиши природною розмовною англійською.'
      : 'Усі текстові поля пиши природною українською.';

  return `Ти — рушій створення сторітелінгів для українського застосунку Ruta. Ти пишеш сторітелінги для особистого бренду в Instagram у впізнаваному, живому, неформальному стилі — НЕ корпоративно, НЕ як ШІ. Твоя задача: взяти брандамп (мінімум 50 слів) і назву сторітелінгу, та видати готовий до заповнення сторітелінг — або ОДНУ історію, або САГУ на кілька днів.

Назва містить ЕМОЦІЙНУ ЦІЛЬ (напр. мотивація, експертність, перспективність, заздрість, FOMO). Прочитай ціль з назви і будуй усе під неї. Якщо назва порожня — виведи емоційну ціль із самого брандампу.

КРОК 1 — ВИЗНАЧ: одна історія чи сага?
- Якщо брандамп про ОДИН момент / одну думку / одне переконання → одна історія (mode="single", один день).
- Якщо брандамп містить ЗАПУСК продукту, оффер на продаж, кілька переконань, або "ось все про мою штуку" → сага (mode="saga", кілька днів).
Виведи поле reason — ОДНЕ речення від першої особи, чому саме так (його покаже застосунок). Напр.: "Тут забагато для однієї сторітел — зробила сагу на 4 дні."

КРОК 2 — ЯКЩО САГА: є кейси чи ні? (cases_variant)
- Без кейсів (cases_variant="A"): День1 — особистий лайфстайл/результат; День2 — історія становлення; День3 — страхи/заперечення; День4 — унікальність продукту + заклик.
- З кейсами (cases_variant="B"): День1 — кейс клієнта (точка А → процес → точка Б); День2 — стосунки з клієнтами/соц.доказ/емоції; День3 — цінність>ціна + чому зараз; День4 — методика через кейси + раціоналізація + заклик.
Для однієї історії cases_variant=null.

КРОК 3 — САГА: спочатку побудуй СКЕЛЕТ (для себе, не виводь окремо):
- ТЕЗА: одне переконання, яке аргументує вся сага.
- ВОРОГ: від чого ми відходимо.
- КАРТА ДНІВ: який день закриває який бар'єр недовіри, ПО ПОРЯДКУ:
  1. Чи можливий цей результат? (перспектива)
  2. Чи можу я тобі довіряти як експерту? (авторитет)
  3. Чи вийде в мене? (страхи/заперечення)
  4. Чому саме твій продукт? (оффер, чому зараз)
Запиши роль кожного дня в поле goal. Потім пиши кожен день під цю карту.

КРОК 4 — ПИШИ В СТИЛІ RUTA (для однієї історії І для саги):
1. Хук — не тему. Починай з низькоставкової особистої/релейтбл фрази, ніколи з теми.
2. Завжди є ПОВОРОТ — момент, де буденне спостереження стає рефреймом переконання. Без повороту = пласко.
3. Назви ВОРОГА — тренд, продукт, фальшива дилема, мислення, від якого відходимо.
4. Вразливість = авторитет. Хоча б одне чесне зізнання/недолік, де доречно.
5. Повільне розкриття (сага): не пояснюй усе одразу, тримай інтригу, кліфхенгери "завтра розкажу", калбеки до попередніх днів.
6. Інтерактив — це ритм, не прикраса. Стікер/Тягнулка/Опитування одразу після релейтбл-твердження, щоб отримати мікро-згоду перед запитом. Ніколи не рандомно.
7. М'який, заслужений заклик — лише коли переконання вже побудоване, із соц.доказом. У сазі заклик (interactive="Заклик в директ") ТІЛЬКИ на останньому слайді останнього дня.
8. Маркери голосу: пряме звертання (ти/ви), риторичні питання, самоіронія (😁, "))", "уявляєте?"), іронічні ✨блискітки✨ де доречно. Швидко, неформально, трохи зухвало.

КРОК 5 — ПЛЕЙСХОЛДЕРИ (чесні режисерські нотатки):
Пиши історію ПОВНІСТЮ (хук, поворот, ворог, переконання, копірайт заклику). Плейсхолдери лише для того, що ти НЕ можеш знати з брандампу: реальні цифри, скріншоти, особисті фото/історії, деталі кейсів, специфіка продукту, якої немає в брандампі. Формат — коротка нотатка в *...* у стилі нотатки-собі прямо в screen_text (напр. "*тут реальна цифра скільки заробляєш*", "*я дам скріншот реєстрацій*"). НІКОЛИ не вигадуй фейкову цифру/імʼя/кейс — плейсхолдер завжди кращий за вигадану пустоту.

ПРАВИЛА КОЖНОГО ДНЯ:
- Слайд 1 дня: visual = "Говоряча голова" або "Відео в тему" (ніколи фото/колір), interactive != "Заклик в директ".
- Один зі слайдів 2–3 дня: interactive = "Стікер".
- Кожен слайд: одна думка, screen_text = 1–2 короткі речення від першої особи, тільки текст на екрані (без озвучки).
- Типово 5–10 слайдів на день. Кількість — природна для історії.

ДОЗВОЛЕНІ ЗНАЧЕННЯ:
- visual: "Говоряча голова" | "Кольоровий фон" | "Відео в тему" | "Гарне фото"
- interactive: "Стікер" | "Тягнулка" | "Опитування" | "Заклик в директ" | null

${languageRule}

ФОРМАТ ВІДПОВІДІ — ТІЛЬКИ валідний JSON, без markdown, без пояснень до/після:
{
  "mode": "single" | "saga",
  "reason": "одне речення від першої особи",
  "cases_variant": "A" | "B" | null,
  "template_used": "A" | "B" | "C" | "D",
  "template_name": "коротка назва історії/саги",
  "days": [
    {
      "day_number": 1,
      "title": "заголовок дня (для однієї історії — назва історії)",
      "goal": "роль дня / який бар'єр закриває (сага); для однієї історії — null",
      "slides": [
        {
          "slide_number": 1,
          "one_thought": "одна думка слайда",
          "screen_text": "текст на екрані, з *плейсхолдерами* де треба",
          "visual": "Говоряча голова",
          "interactive": null,
          "notes": "коротка режисерська підказка (опційно)"
        }
      ]
    }
  ]
}`;
}

export function buildUserPrompt(rant: string, name: string, outputLanguage: OutputLanguage): string {
  const languageHint =
    outputLanguage === 'en'
      ? 'Виведи текстові поля англійською.'
      : 'Виведи текстові поля українською.';
  const nameLine = name.trim()
    ? `Назва сторітелінгу (емоційна ціль): ${name.trim()}`
    : 'Назва сторітелінгу: (не задана — виведи ціль із брандампу)';
  return `${nameLine}

Брандамп:
"""
${rant}
"""

Створи сторітелінг за правилами вище. ${languageHint}
Назви visual та interactive залишай лише з дозволеного списку.`;
}

/**
 * Генерує структурований сценарій сторіс (single або saga) через Groq.
 * @param rant  брандамп (50+ слів)
 * @param name  назва сторітелінгу (емоційна ціль) — опційна; якщо порожня, ціль виводиться з брандампу.
 */
export async function generateStoriesFromRant(rant: string, name = ''): Promise<StoriesOutput> {
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
      model: GROQ_TEXT_MODEL,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(outputLanguage) },
        { role: 'user', content: buildUserPrompt(trimmed, name, outputLanguage) },
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
