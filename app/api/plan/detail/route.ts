import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { isShareableRefTable, toSharedDetail } from '@/lib/calendar/sharedCalendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A piece of План, written out — for the panel beside the month grid.
 *
 * The same document the client's shared calendar gets, from the same database
 * function (migration 049), so the two calendars cannot disagree about what a
 * reel contains. The difference is the credential: there is no token here, the
 * signed-in user IS the authorisation, and `plan_piece_document` reads
 * `auth.uid()` itself. This route cannot widen that — posting someone else's
 * piece id returns null from the database, not their content.
 */
export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { refTable?: string; id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const { refTable, id } = body;
  if (!id || !isShareableRefTable(refTable)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('plan_piece_document', {
    p_ref_table: refTable,
    p_id: id,
  });
  if (error) {
    console.error('[plan] piece detail failed:', error.message);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }

  const detail = toSharedDetail(data);
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, detail });
}
