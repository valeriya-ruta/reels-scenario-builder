import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ruta Pro quick bug report. Writes to `pro_bug_reports` in the app's own
 * Supabase (no external API / rate limits). The operator's Звіти page reads it,
 * and it can be triaged/fixed straight from the DB.
 */
function clip(v: unknown, max = 1000): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const comment = clip(body.comment, 4000);
  if (!comment) return NextResponse.json({ error: 'empty' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('pro_bug_reports')
    .insert({
      owner_user_id: user.id,
      comment,
      route: clip(body.route),
      edition: clip(body.edition, 40),
      blogger_name: clip(body.blogger, 120),
      element: clip(body.element),
      element_text: clip(body.elementText),
      viewport: clip(body.viewport, 40),
      user_agent: clip(body.userAgent, 400),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[pro] bug report insert failed', error.message);
    return NextResponse.json({ error: 'db' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
