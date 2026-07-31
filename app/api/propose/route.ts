import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { buildSignals, type SignalInputs } from '@/lib/propose/signals';
import { fallbackProposals } from '@/lib/propose/fallback';
import { proposeAngles, tagWithSourceKinds } from '@/lib/propose/proposeAngles';
import { PROPOSAL_COUNT, type ProposeResponse } from '@/lib/propose/types';
import type { ContentType } from '@/lib/contentTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Proposals for a creation entry point (task: "propose, don't provide").
 *
 * Reads the user's own recent braindumps + content pieces, distils them into
 * signals, and asks the model for angles. If the model leg fails for any reason
 * the deterministic fallback still returns a full set — the screen must never
 * open on an empty box, so this route has no failure mode that returns nothing.
 */

/** View content_type → braindump ContentType (the view speaks singular). */
const VIEW_TYPE_TO_CONTENT_TYPE: Record<string, ContentType | null> = {
  reel: 'reels',
  carousel: 'carousel',
  story: 'stories',
  idea: null,
};

export async function GET() {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: 'Потрібен вхід.' }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const [piecesRes, ideasRes, linksRes] = await Promise.all([
    supabase
      .from('content_pieces')
      .select('id,content_type,status,title,scheduled_date,updated_at')
      .eq('user_id', user.id)
      .neq('ref_table', 'ideas')
      .order('updated_at', { ascending: false })
      .limit(30),
    supabase
      .from('ideas')
      .select('id,content,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15),
    supabase.from('idea_content_links').select('idea_id').eq('user_id', user.id),
  ]);

  const childCounts = new Map<string, number>();
  for (const row of (linksRes.data as { idea_id: string }[] | null) ?? []) {
    childCounts.set(row.idea_id, (childCounts.get(row.idea_id) ?? 0) + 1);
  }

  const inputs: SignalInputs = {
    pieces: (
      (piecesRes.data as
        | {
            id: string;
            content_type: string;
            status: string;
            title: string | null;
            scheduled_date: string | null;
            updated_at: string;
          }[]
        | null) ?? []
    ).map((p) => ({
      id: p.id,
      title: (p.title ?? '').trim() || 'Без назви',
      type: VIEW_TYPE_TO_CONTENT_TYPE[p.content_type] ?? null,
      status: p.status,
      scheduledDate: p.scheduled_date,
      updatedAt: p.updated_at,
    })),
    ideas: (
      (ideasRes.data as { id: string; content: string; created_at: string }[] | null) ?? []
    ).map((i) => ({
      id: i.id,
      content: i.content ?? '',
      createdAt: i.created_at,
      childCount: childCounts.get(i.id) ?? 0,
    })),
  };

  const signals = buildSignals(inputs, new Date().toISOString());
  const fallback = fallbackProposals(signals, PROPOSAL_COUNT);

  let proposals = fallback;
  let source: ProposeResponse['source'] = 'fallback';
  try {
    const ai = tagWithSourceKinds(await proposeAngles(signals), signals);
    if (ai.length > 0) {
      // Top up from the fallback so the user always sees the full set even when
      // the model returns fewer than asked.
      proposals = [...ai, ...fallback].slice(0, PROPOSAL_COUNT);
      source = 'ai';
    }
  } catch (e) {
    console.error('[propose] angle generation failed, serving fallback:', e);
  }

  return NextResponse.json({ proposals, source } satisfies ProposeResponse);
}
