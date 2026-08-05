import { NextResponse } from 'next/server';
import { recordDecision } from '@/lib/pro/share';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * No-login client approve/reject. The unguessable token is the only credential;
 * the anon RLS UPDATE policy (revoked=false) permits the write, and this route
 * only ever mutates the `decisions` map (see lib/pro/share.recordDecision).
 */
export async function POST(req: Request) {
  let body: { token?: string; ideaId?: string; decision?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const { token, ideaId, decision } = body;
  if (!token || !ideaId || (decision !== 'approved' && decision !== 'rejected')) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const ok = await recordDecision(token, ideaId, decision);
  if (!ok) return NextResponse.json({ error: 'not found or expired' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
