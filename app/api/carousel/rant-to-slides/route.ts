import { NextRequest, NextResponse } from 'next/server';
import { buildSystemPrompt, detectOutputLanguage } from '@/lib/ai/carouselPrompt';
import { generateCarouselRaw } from '@/lib/ai/carouselModel';
import { postProcessCarouselRant } from '@/lib/ai/carouselRantPostProcess';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { aiLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

// Carousel generation moved to Gemini 2.5 Pro (#56), a *reasoning* model that
// routinely takes 30–60s where the old Groq/Llama call took ~2–5s. Without an
// explicit budget this route ran on the platform default (~10–15s) and Vercel
// killed the function mid-generation, so the carousel silently never got
// created. Give it the same headroom as the app's other AI-heavy function
// (competitor-analysis, 60s in vercel.json). Reels/stories don't need this —
// they still use fast Groq via server actions, not this route.
export const maxDuration = 60;

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

  let raw: string;
  try {
    raw = await generateCarouselRaw(buildSystemPrompt(outputLanguage), rant);
  } catch (e) {
    console.error('[carousel/rant-to-slides] model error:', e);
    return NextResponse.json({ error: 'Не вдалося згенерувати слайди' }, { status: 502 });
  }

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;
    return NextResponse.json(postProcessCarouselRant(parsed));
  } catch (e) {
    console.error('[carousel/rant-to-slides] JSON parse failed:', raw, e);
    return NextResponse.json({ error: 'Не вдалось розібрати відповідь AI' }, { status: 500 });
  }
}
