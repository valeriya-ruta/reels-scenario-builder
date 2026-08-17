import { NextResponse } from 'next/server';
import { getSharedPiece } from '@/lib/calendar/share';
import { isShareableRefTable } from '@/lib/calendar/sharedCalendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The detail view behind a card on a shared calendar (no login).
 *
 * The unguessable token is the only credential, and it is checked inside the
 * database function — this route cannot widen what a token can reach: a piece
 * belonging to anyone else, or an undated one, comes back as null no matter what
 * ids are posted.
 */
export async function POST(req: Request) {
  let body: { token?: string; refTable?: string; id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const { token, refTable, id } = body;
  if (!token || !id || !isShareableRefTable(refTable)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const detail = await getSharedPiece(token, refTable, id);
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, detail });
}
