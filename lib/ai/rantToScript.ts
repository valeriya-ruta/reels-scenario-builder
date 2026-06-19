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
Перетвори наданий рент на сценарій рілсу. Рілс — це коротке відео (30–90 секунд). Кожна сцена = ОДИН короткий момент на екрані тривалістю 3–5 секунд (одна думка, одна емоція).

🟢 НАЙВАЖЛИВІШЕ ПРАВИЛО — ДОВЖИНА СЦЕНИ:
- Кожна сцена має звучати 3–5 секунд. У темпі мовлення це ≈ 6–11 слів — одне коротке речення.
- ЖОДНА сцена не може бути довшою за 5 секунд. Якщо думка довша — РОЗБИЙ її на кілька послідовних сцен по 3–5 секунд кожна (наприклад, одне довге речення → 2–3 коротші сцени, що йдуть по черзі).
- Не склеюй дві думки в одну сцену. Краще більше коротких сцен, ніж одна довга.
- Розбивай так, щоб кожна сцена читалась як цілісний самостійний момент — без обірваних на півслові фраз.

ОБОВ'ЯЗКОВА ДРАМАТУРГІЯ (це ЕТАПИ історії, а не кількість сцен — кожен етап може займати кілька сцен по 3–5 с):

**1. ХУК (рівно ОДИН, на самому початку, 0–3 секунди)**
- Перший рядок, який зупиняє скролінг
- Формати: провокаційне твердження / незручна правда / риторичне питання / несподіваний факт
- НЕ починай зі "Сьогодні я розповім..." або "Привіт, друзі"
- Одне коротке речення. Має цепляти одразу.
- ⚠️ Хук повертається ТІЛЬКИ в полі "hook". НЕ додавай його як сцену в "scenes" і НЕ повторюй його там іншими словами. Хук буває рівно один.

**2. ПРОБЛЕМА / КОНФЛІКТ** (сцена/сцени)
- Озвуч біль, з яким глядач себе ідентифікує
- Будь конкретним, не абстрактним. Не "багато людей стикаються з цим" — а "ти сидиш і дивишся на порожній екран вже 40 хвилин"
- Покажи, що ти розумієш ситуацію зсередини
- Якщо тут кілька думок — розбий на кілька сцен по 3–5 с

**3. ПОВОРОТ / ІНСАЙТ** (сцена/сцени)
- Момент "а що якщо?" або "я зрозумів, що..."
- Це серцевина відео — головна думка, яку автор хоче донести
- Має відчуватися як реальне відкриття, не банальна порада

**4. РІШЕННЯ / ТРАНСФОРМАЦІЯ** (сцена/сцени)
- Конкретні кроки, зміна поведінки, або нова перспектива
- Кожен крок — окрема сцена 3–5 с, а не один довгий перелік
- Глядач має відчути: "це я можу зробити"

**5. CTA (рівно ОДИН, у самому кінці)**
- Один конкретний заклик: зберегти, підписатись, написати в коментарях, спробувати
- Прив'яжи CTA до теми відео. Не загальне "підписуйся якщо сподобалось"
- ⚠️ CTA повертається ТІЛЬКИ в полі "cta". НЕ додавай його як сцену в "scenes" і НЕ повторюй його там. CTA буває рівно один.

---

🔑 РОЗПОДІЛ ПО ПОЛЯХ (КРИТИЧНО):
- "hook" — рівно один хук (етап 1). Більше ніде його не дублюй.
- "scenes" — ЛИШЕ середина історії: етапи 2, 3, 4. Тут НЕМАЄ ні хука, ні CTA.
- "cta" — рівно один заклик (етап 5). Більше ніде його не дублюй.
Тобто фінальний рілс = [hook] + scenes + [cta]: один хук на початку, один CTA в кінці, ніколи по два.

---

ПРАВИЛА НАПИСАННЯ:
${languageRule}
- Довжина КОЖНОЇ сцени: 3–5 секунд екранного часу = ≈ 6–11 слів, одне коротке речення. Це жорстке обмеження.
- Кількість сцен НЕ обмежена згори — роби стільки, скільки треба, щоб кожна вкладалась у 3–5 с. Рілс на 30–90 с зазвичай це 8–25 сцен.
- Сцени мають іти ПОСЛІДОВНО і логічно: навіть розбиті на дрібні шматки, вони читаються як єдина історія по порядку.
- Тон: береги голос автора. Якщо рент емоційний — сценарій теж має бути емоційним. Якщо іронічний — збережи іронію.
- НЕ додавай нічого, чого не було в ренті. Тільки реструктуруй, загостри і розбий на короткі сцени.
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

/** Normalize a line so a hook/CTA repeated in `scenes[]` can be matched against
 *  its dedicated field even with different casing, quotes or trailing punctuation. */
function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/["'«»„“”]/g, '')
    .replace(/[.!?…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Labels the model uses when it (wrongly) emits the hook/CTA as a scene too.
const HOOK_LABELS = new Set(['хук', 'hook']);
const CTA_LABELS = new Set(['cta', 'заклик', 'call to action', 'call-to-action']);

/**
 * Flattens the model response into ordered scene rows: exactly one hook (first),
 * the middle beats, then exactly one CTA (last).
 *
 * The hook and CTA are dedicated fields, but the model sometimes ALSO emits them
 * inside `scenes[]` (labeled ХУК / CTA, as "перша/остання сцена") — which used to
 * produce a doubled hook and doubled CTA in the generated reel (task 86d3dcn4d).
 * Defensively drop any scene that is the hook/CTA repeated — matched by its label
 * or by its (normalized) text equal to the hook/CTA field — so there is always
 * exactly one of each regardless of how the model structures its output.
 */
function flattenToSceneDrafts(parsed: RantResponse, outputLanguage: OutputLanguage): RantSceneDraft[] {
  const rows: RantSceneDraft[] = [];

  const hook = (parsed.hook ?? '').trim();
  const cta = (parsed.cta ?? '').trim();
  const hookKey = normalizeForCompare(hook);
  const ctaKey = normalizeForCompare(cta);

  if (hook) {
    rows.push({ text: hook, name: outputLanguage === 'en' ? 'HOOK' : 'ХУК', editor_note: null });
  }

  for (const s of parsed.scenes ?? []) {
    const text = (s.text ?? '').trim();
    if (!text) continue;
    const label = (s.label ?? '').trim();
    const labelKey = label.toLowerCase();
    // Skip a scene explicitly labeled as the hook/CTA …
    if (HOOK_LABELS.has(labelKey) || CTA_LABELS.has(labelKey)) continue;
    // … or one whose text just repeats the dedicated hook/CTA line.
    const textKey = normalizeForCompare(text);
    if (hookKey && textKey === hookKey) continue;
    if (ctaKey && textKey === ctaKey) continue;
    rows.push({
      text,
      name: label || null,
      editor_note: null,
    });
  }

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
