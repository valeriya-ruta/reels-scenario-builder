import { NextResponse } from 'next/server';
import { generateStoriesFromRant } from '@/lib/ai/rantToStories';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { aiLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { rant?: string };
  try {
    body = (await req.json()) as { rant?: string };
  } catch {
    return NextResponse.json({ error: 'Некоректний формат запиту.' }, { status: 400 });
  }

  const rant = body.rant?.trim();
  if (!rant) {
    return NextResponse.json({ error: 'Введи рент перед генерацією.' }, { status: 400 });
  }

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

  try {
    const normalized = await generateStoriesFromRant(rant);
    return NextResponse.json(normalized);
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : 'Щось пішло не так. Спробуй ще раз.';
    const isClientErr = message === 'Введи рент перед генерацією.';
    console.error('[stories/generate]', error);
    return NextResponse.json({ error: message }, { status: isClientErr ? 400 : 502 });
  }
}
