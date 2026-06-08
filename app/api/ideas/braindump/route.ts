import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

/**
 * Braindump auto-save.
 *
 * The braindump overlay auto-saves the captured idea here on reaching State B
 * (and again if the user edits the text). It writes one `public.ideas` row per
 * braindump session (`id` echoed back so subsequent edits update the same row).
 *
 * Persistence target: the `ideas` table (migration supabase/migrations/019_ideas.sql)
 * — the canonical home for captured ideas. `title` is left null on braindump saves
 * (reserved for future list/swipe-deck labels). RLS is owner-only, so the user's
 * authed Supabase client can only read/write its own rows.
 */
export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: 'Потрібен вхід.' }, { status: 401 });
  }

  let body: { id?: string; content?: string };
  try {
    body = (await req.json()) as { id?: string; content?: string };
  } catch {
    return NextResponse.json({ error: 'Некоректний формат запиту.' }, { status: 400 });
  }

  const content = body.content?.trim() ?? '';
  if (!content) {
    return NextResponse.json({ error: 'Порожня ідея.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  // Update the existing row when this session already saved one; otherwise insert.
  if (body.id) {
    const { data, error } = await supabase
      .from('ideas')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .eq('user_id', user.id)
      .select('id')
      .single();
    if (error) {
      return NextResponse.json({ error: saveErrorMessage(error.message) }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: data.id });
  }

  const { data, error } = await supabase
    .from('ideas')
    .insert({ user_id: user.id, content, source: 'braindump' })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: saveErrorMessage(error.message) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}

function saveErrorMessage(detail: string): string {
  // Surface a clean message; the overlay renders it in neutral zinc.
  if (/relation .*ideas.* does not exist/i.test(detail)) {
    return 'Сховище ідей ще не налаштоване.';
  }
  return 'Не вдалося зберегти ідею.';
}
