import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

/**
 * Braindump auto-save.
 *
 * The braindump overlay auto-saves the captured idea here on reaching State B
 * (and again if the user edits the text). It upserts a single `ideas` row per
 * braindump session (`id` echoed back so subsequent edits update the same row).
 *
 * PERSISTENCE STATUS — NEEDS INPUT (task 86d38zghd):
 * There is currently NO free-text idea/braindump store in the database. The
 * existing `idea_scans` table is competitor-scan cache (handle / followers /
 * reels), not a place for captured thoughts. Per the working contract we do not
 * invent a schema unilaterally, so this route targets an `ideas` table that is
 * pending Kunj's confirmation. Proposed minimal schema:
 *
 *   create table public.ideas (
 *     id uuid primary key default gen_random_uuid(),
 *     user_id uuid not null references auth.users(id) on delete cascade,
 *     content text not null,
 *     source text not null default 'braindump',
 *     created_at timestamptz not null default now(),
 *     updated_at timestamptz not null default now()
 *   );
 *   + RLS: owner can select/insert/update/delete where auth.uid() = user_id.
 *
 * Until that table exists the insert returns an error, which the overlay shows
 * as a neutral (zinc) "could not save" notice while preserving the user's text.
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
