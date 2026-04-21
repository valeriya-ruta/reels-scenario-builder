import { NextRequest, NextResponse } from 'next/server';
import { requireServerEnv } from '@/lib/env';
import { postProcessCarouselRant } from '@/lib/ai/carouselRantPostProcess';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { aiLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

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
      ? 'Усі текстові поля (title/body/label/items) пиши англійською.'
      : 'Усі текстові поля (title/body/label/items) пиши українською.';

  return `Ти — досвідчений копірайтер каруселей для Instagram. Перетворюєш сирий рент на серію слайдів для візуального шаблону з типами слайдів.

ПРИНЦИП: одна думка — один слайд. Не перевантажуй текст.

══════════════════════════════
ТИПИ СЛАЙДІВ (type) — СУВОРО ЦІ ЗНАЧЕННЯ
══════════════════════════════

type має бути один із: cover, content, statement, bullets, cta

- cover — обкладинка (сильний заголовок теми)
- content — пояснення / крок / контекст (може бути label як «Крок 01», body, icon)
- statement — коротке ударне твердження (ритм; 1–2 таких слайди на всю карусель; НІКОЛИ не став два statement підряд)
- bullets — список тез (поле items — масив рядків)
- cta — заклик до дії (останній слайд)

ПЕРШИЙ слайд завжди type=cover. ОСТАННІЙ завжди type=cta.

══════════════════════════════
ІКОНКИ (icon)
══════════════════════════════

Дозволені значення icon (або null): image, lightning, star, check, arrow-right, clock, calendar, fire, sparkle, target, camera, pen, chart, heart, globe

══════════════════════════════
АКЦЕНТ У ТЕКСТІ
══════════════════════════════

Щоб позначити фрагмент під брендовий акцент у рендері, обгорни його у фігурні дужки в title або body, наприклад: {Базовий кадр} — твоя відправна точка
Поле accent_spans зазвичай порожній масив [] — акцент задається лише дужками в тексті.

══════════════════════════════
ПОЛЯ
══════════════════════════════

- title — заголовок (рядок або null де доречно)
- body — основний текст (рядок або null)
- label — короткий підпис: крок («Крок 01»), «Проблема», підказка для CTA тощо; або null
- items — лише для bullets: масив коротких рядків; інакше null
- icon — див. список вище або null

══════════════════════════════
КІЛЬКІСТЬ
══════════════════════════════

Мінімум 5 слайдів, максимум 12.

══════════════════════════════
ФОРМАТ ВІДПОВІДІ
══════════════════════════════

Лише JSON, без markdown і без тексту поза JSON.
${languageRule}

Приклад структури:

{
  "total_slides": 5,
  "slides": [
    {
      "type": "cover",
      "title": "ШІ-відео без ідеального фото",
      "body": null,
      "label": null,
      "items": null,
      "icon": null,
      "accent_spans": []
    },
    {
      "type": "content",
      "title": "{Базовий кадр} — твоя відправна точка",
      "body": "Фото з кафе, вулиці або офісу. ШІ відтворить і розвине його.",
      "label": "Крок 01",
      "items": null,
      "icon": "image",
      "accent_spans": []
    },
    {
      "type": "statement",
      "title": "Є фото — є контент.",
      "body": null,
      "label": null,
      "items": null,
      "icon": "lightning",
      "accent_spans": []
    },
    {
      "type": "bullets",
      "title": "Чому це працює",
      "body": null,
      "label": null,
      "items": ["Пункт один", "Пункт два", "Пункт три"],
      "icon": null,
      "accent_spans": []
    },
    {
      "type": "cta",
      "title": "Пиши СЛОВО в коментарі",
      "body": "Отримай гайд по референсах для ШІ",
      "label": "Хочеш гайд?",
      "items": null,
      "icon": null,
      "accent_spans": []
    }
  ]
}`;
}

export async function POST(req: NextRequest) {
  let body: { rant?: string };
  try {
    body = (await req.json()) as { rant?: string };
  } catch {
    return NextResponse.json({ error: 'Некоректний JSON' }, { status: 400 });
  }

  const rant = body.rant?.trim() ?? '';
  if (!rant || rant.length < 10) {
    return NextResponse.json({ error: 'Рент занадто короткий' }, { status: 400 });
  }
  const outputLanguage = detectOutputLanguage(rant);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Необхідно увійти в акаунт.' }, { status: 401 });
  }

  const { success, reset } = await aiLimit.limit(user.id);
  if (!success) {
    return NextResponse.json(
      { error: 'Ліміт запитів вичерпано. Спробуй пізніше.', reset },
      { status: 429 },
    );
  }

  const apiKey = requireServerEnv('GROQ_API_KEY');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(outputLanguage) },
        { role: 'user', content: rant },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[carousel/rant-to-slides] Groq error:', res.status, errText);
    return NextResponse.json({ error: 'Не вдалося згенерувати слайди' }, { status: 502 });
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const raw = payload.choices?.[0]?.message?.content ?? '';

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;
    return NextResponse.json(postProcessCarouselRant(parsed));
  } catch (e) {
    console.error('[carousel/rant-to-slides] JSON parse failed:', raw, e);
    return NextResponse.json({ error: 'Не вдалось розібрати відповідь AI' }, { status: 500 });
  }
}
