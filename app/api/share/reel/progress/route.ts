import { NextResponse } from 'next/server';
import { setSharedProgress } from '@/lib/reels/share';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The client ticking something off (no login).
 *
 * The token is the only credential and it is checked inside the database
 * function, which also refuses a block that is not part of that link's reels —
 * so this route cannot widen what a token reaches, whatever ids are posted.
 */
export async function POST(req: Request) {
  let body: { token?: string; blockId?: string; slot?: string; done?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const { token, blockId, slot, done } = body;
  if (!token || !blockId || !slot || typeof done !== 'boolean') {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const ok = await setSharedProgress(token, blockId, slot, done);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
