import { NextRequest, NextResponse } from 'next/server';
import { requireServerEnv } from '@/lib/env';
import { GROQ_TEXT_MODEL } from '@/lib/ai/groqModel';
import { buildSystemPrompt, detectOutputLanguage } from '@/lib/ai/carouselPrompt';
import { postProcessCarouselRant } from '@/lib/ai/carouselRantPostProcess';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { aiLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

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
      model: GROQ_TEXT_MODEL,
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
