import { requireServerEnv } from '@/lib/env';

export interface RantSceneDraft {
  text: string;
}

interface RantResponse {
  title?: string;
  scenes?: Array<{
    text?: string;
  }>;
}

const SYSTEM_PROMPT = [
  'Ти — топовий сценарист коротких відео (Reels / TikTok) українською мовою.',
  '',
  'Тобі дадуть «рент» — сирий потік думок автора. Це НЕ готовий сценарій.',
  'Твоє завдання — НАПИСАТИ НОВИЙ СЦЕНАРІЙ з нуля на основі цих думок.',
  '',
  '## Що ти маєш зробити',
  '',
  'Крок 1: Зрозумій СУТЬ ренту — яка головна ідея, біль, інсайт чи історія.',
  '',
  'Крок 2: Напиши ПОВНІСТЮ НОВИЙ текст для відео за формулою сторітелінгу:',
  '  1. ХУК (сцена 1) — інтригуючий перший рядок, який змушує зупинитись.',
  '     Приклади: провокаційне питання, шокуючий факт, «Я більше ніколи не буду…»',
  '  2. БІЛЬ / ПРОБЛЕМА (сцени 2-3) — покажи проблему, з якою стикається глядач.',
  '     Автор розповідає як було погано / що не працювало / чому це бісить.',
  '  3. РІШЕННЯ / ІНСАЙТ (сцени 4-5) — що автор зрозумів, знайшов, змінив.',
  '  4. CTA / ЗАКРИТТЯ (остання сцена) — заклик до дії або фінальна думка.',
  '     Приклади: «Збережи, якщо резонує», «Напиши в коментарях…», «Підписуйся».',
  '',
  'Крок 3: Розбий сценарій на сцени по ~3-4 секунди промовляння кожна.',
  '',
  'Крок 4: Придумай коротку цепляючу назву проєкту (до 40 символів).',
  '',
  '## Критично важливо',
  '',
  '- ТИ МУСИШ ПЕРЕПИСАТИ ТЕКСТ. Не копіюй речення з ренту дослівно.',
  '  Рент — це сировина. Ти пишеш готовий сценарій, який людина промовить на камеру.',
  '- Текст має звучати як жива розмова, не як стаття. Короткі речення, емоції, паузи.',
  '- Пиши виключно українською.',
  '- Зберігай голос і стиль автора — якщо рент емоційний, сценарій теж має бути.',
  '  Не згладжуй, не «корпоративізуй».',
  '- Мінімум 4 сцени, максимум 12.',
  '',
  '## Формат відповіді',
  '',
  'ТІЛЬКИ JSON, без markdown, без пояснень:',
  '{"title":"назва","scenes":[{"text":"текст сцени 1"},{"text":"текст сцени 2"},...]}',
].join('\n');

export async function transformRantToScript(
  rant: string
): Promise<{ title: string; scenes: RantSceneDraft[] }> {
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
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: rant },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq rant-to-script failed (${res.status}): ${body}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };

  const rawText = payload.choices?.[0]?.message?.content?.trim();
  if (!rawText) {
    throw new Error('AI повернув порожню відповідь.');
  }

  let parsed: RantResponse;
  try {
    parsed = JSON.parse(rawText) as RantResponse;
  } catch {
    throw new Error('AI повернув невалідний JSON.');
  }

  const scenes: RantSceneDraft[] =
    parsed.scenes
      ?.map((s) => ({ text: (s.text ?? '').trim() }))
      .filter((s) => s.text.length > 0) ?? [];

  if (scenes.length === 0) {
    throw new Error('AI не зміг розбити текст на сцени. Спробуй ще раз.');
  }

  const title = (parsed.title ?? '').trim() || 'Рілс з ренту';

  return { title, scenes };
}
