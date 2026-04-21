import { requireServerEnv } from '@/lib/env';

export interface RantSceneDraft {
  text: string;
  name?: string | null;
  editor_note?: string | null;
}

interface RantResponse {
  title?: string;
  hook?: string;
  cta?: string;
  scenes?: Array<{
    id?: number;
    label?: string;
    text?: string;
  }>;
}

type OutputLanguage = 'uk' | 'en';

function detectOutputLanguage(rant: string): OutputLanguage {
  const cyr = (rant.match(/[А-Яа-яІіЇїЄєҐґ]/g) ?? []).length;
  const latin = (rant.match(/[A-Za-z]/g) ?? []).length;
  if (latin >= 20 && latin >= cyr * 1.2) return 'en';
  return 'uk';
}

function buildSystemPrompt(outputLanguage: OutputLanguage): string {
  const languageRule =
    outputLanguage === 'en'
      ? '- Language: natural conversational English. Keep the creator voice and emotional tone.'
      : '- Мова: українська, розмовна, жива. Як говорить автор, не як пишуть у підручниках.';

  return `Ти — досвідчений сценарист коротких відео для Instagram Reels. Ти вмієш брати сирий, неструктурований рент (голосовий або текстовий) і перетворювати його на чіткий, виконуваний сценарій із сильним сторітелінгом.

ТВОЄ ЗАВДАННЯ:
Перетвори наданий рент на сценарій рілсу. Рілс — це коротке відео (30–90 секунд). Кожна сцена = одна думка, один візуальний момент, одна емоція.

ОБОВ'ЯЗКОВА СТРУКТУРА (не відступай від неї):

**1. ХУК (0–3 секунди)**
- Перший рядок, який зупиняє скролінг
- Формати: провокаційне твердження / незручна правда / риторичне питання / несподіваний факт
- НЕ починай зі "Сьогодні я розповім..." або "Привіт, друзі"
- Максимум 1–2 речення. Має цепляти одразу.

**2. ПРОБЛЕМА / КОНФЛІКТ (сцени 1–2)**
- Озвуч біль, з яким глядач себе ідентифікує
- Будь конкретним, не абстрактним. Не "багато людей стикаються з цим" — а "ти сидиш і дивишся на порожній екран вже 40 хвилин"
- Покажи, що ти розумієш ситуацію зсередини

**3. ПОВОРОТ / ІНСАЙТ (сцена 3)**
- Момент "а що якщо?" або "я зрозумів, що..."
- Це серцевина відео — головна думка, яку автор хоче донести
- Має відчуватися як реальне відкриття, не банальна порада

**4. РІШЕННЯ / ТРАНСФОРМАЦІЯ (сцени 4–5)**
- Конкретні кроки, зміна поведінки, або нова перспектива
- Максимум 2–3 пункти. Не перевантажуй.
- Глядач має відчути: "це я можу зробити"

**5. CTA (остання сцена)**
- Один конкретний заклик: зберегти, підписатись, написати в коментарях, спробувати
- Прив'яжи CTA до теми відео. Не загальне "підписуйся якщо сподобалось"

---

ПРАВИЛА НАПИСАННЯ:
${languageRule}
- Довжина кожної сцени: 1–4 речення (≈ 3–8 секунд екранного часу)
- Загальна кількість сцен: 5–8 (не більше)
- Тон: береги голос автора. Якщо рент емоційний — сценарій теж має бути емоційним. Якщо іронічний — збережи іронію.
- НЕ додавай нічого, чого не було в ренті. Тільки реструктуруй і загостри.
- НЕ розводь воду. Кожне речення має працювати.

ФОРМАТ ВІДПОВІДІ:
Повертай тільки JSON. Без markdown, без пояснень, без вступних слів.

{
  "title": "Назва сценарію (коротка, описова)",
  "hook": "Текст хука",
  "scenes": [
    {
      "id": 1,
      "label": "Проблема",
      "text": "Текст сцени"
    },
    ...
  ],
  "cta": "Текст CTA"
}`;
}

function buildUserContent(rant: string, outputLanguage: OutputLanguage): string {
  const languageHint =
    outputLanguage === 'en'
      ? 'Write all output fields in English.'
      : 'Пиши всі поля відповіді українською.';
  return `Ось рент автора:

"""
${rant}
"""

Перетвори це на сценарій рілсу за вказаною структурою.
${languageHint}`;
}

function flattenToSceneDrafts(parsed: RantResponse, outputLanguage: OutputLanguage): RantSceneDraft[] {
  const rows: RantSceneDraft[] = [];

  const hook = (parsed.hook ?? '').trim();
  if (hook) {
    rows.push({ text: hook, name: outputLanguage === 'en' ? 'HOOK' : 'ХУК', editor_note: null });
  }

  for (const s of parsed.scenes ?? []) {
    const text = (s.text ?? '').trim();
    if (!text) continue;
    const label = (s.label ?? '').trim();
    rows.push({
      text,
      name: label || null,
      editor_note: null,
    });
  }

  const cta = (parsed.cta ?? '').trim();
  if (cta) {
    rows.push({ text: cta, name: 'CTA', editor_note: null });
  }

  return rows;
}

export async function transformRantToScript(
  rant: string
): Promise<{ title: string; scenes: RantSceneDraft[] }> {
  const apiKey = requireServerEnv('GROQ_API_KEY');
  const outputLanguage = detectOutputLanguage(rant);

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
        { role: 'user', content: buildUserContent(rant, outputLanguage) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[rant-to-script] Groq HTTP error:', res.status, body);
    throw new Error('Щось пішло не так. Спробуй ще раз.');
  }

  const payload = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };

  const rawText = payload.choices?.[0]?.message?.content?.trim();
  if (!rawText) {
    console.error('[rant-to-script] Empty model content');
    throw new Error('Щось пішло не так. Спробуй ще раз.');
  }

  let parsed: RantResponse;
  try {
    parsed = JSON.parse(rawText) as RantResponse;
  } catch (e) {
    console.error('[rant-to-script] Invalid JSON from model:', rawText, e);
    throw new Error('Щось пішло не так. Спробуй ще раз.');
  }

  const hookOk = (parsed.hook ?? '').trim().length > 0;
  const ctaOk = (parsed.cta ?? '').trim().length > 0;
  const hasMiddle = (parsed.scenes ?? []).some((s) => (s.text ?? '').trim().length > 0);
  if (!hookOk || !ctaOk || !hasMiddle) {
    console.error('[rant-to-script] Missing hook, scenes, or CTA:', rawText);
    throw new Error('Щось пішло не так. Спробуй ще раз.');
  }

  const scenes = flattenToSceneDrafts(parsed, outputLanguage);

  if (scenes.length === 0) {
    throw new Error('AI не зміг розбити текст на сцени. Спробуй ще раз.');
  }

  const title = (parsed.title ?? '').trim() || (outputLanguage === 'en' ? 'Reel from rant' : 'Рілс з ренту');

  return { title, scenes };
}
