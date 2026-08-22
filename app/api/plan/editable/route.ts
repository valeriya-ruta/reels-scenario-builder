import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { REEL_BLOCK_COLUMNS } from '@/lib/reels/blocks';
import { toEditableBlock, toEditableStory, type EditableDoc } from '@/lib/plan/editableDoc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A piece of План as a DRAFT — the same piece the detail panel reads, but with
 * the row ids the editor needs to write back to.
 *
 * `/api/plan/detail` deliberately cannot do this: it returns the shared
 * document, which strips ids precisely so a client's read-only copy carries no
 * handles on the owner's rows. Editing needs those handles, so it needs its own
 * door — one that the signed-in owner alone can open.
 *
 * Carousels are not editable here on purpose: they are designed objects, and a
 * side panel would only ever offer a fraction of the editor. They open their
 * own tab instead.
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
  if (!id || (refTable !== 'projects' && refTable !== 'storytelling_projects')) {
    return NextResponse.json({ error: 'not editable here' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  if (refTable === 'projects') {
    // Ownership is enforced twice over: the `user_id` filter here, and RLS
    // underneath it. The blocks read is keyed off a project that already came
    // back owned, so it cannot reach anyone else's.
    const { data: project, error } = await supabase
      .from('projects')
      .select('id,name,overview')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle<{ id: string; name: string | null; overview: string | null }>();

    if (error) {
      console.error('[plan] editable reel read failed:', error.message);
      return NextResponse.json({ error: 'failed' }, { status: 500 });
    }
    if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const { data: blocks } = await supabase
      .from('reel_blocks')
      .select(REEL_BLOCK_COLUMNS)
      .eq('project_id', id)
      .order('order_index', { ascending: true });

    const doc: EditableDoc = {
      kind: 'reel',
      id: project.id,
      name: project.name ?? '',
      overview: project.overview ?? '',
      blocks: (blocks ?? []).map((b) => toEditableBlock(b as Record<string, unknown>)),
    };
    return NextResponse.json({ ok: true, doc });
  }

  const { data: project, error } = await supabase
    .from('storytelling_projects')
    .select('id,name')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle<{ id: string; name: string | null }>();

  if (error) {
    console.error('[plan] editable story read failed:', error.message);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: columns } = await supabase
    .from('storytelling_columns')
    .select('id')
    .eq('project_id', id)
    .order('order_index', { ascending: true });

  const columnIds = ((columns ?? []) as { id: string }[]).map((c) => c.id);
  const { data: stories } = columnIds.length
    ? await supabase
        .from('storytelling_stories')
        .select('id,text,visual,engagement,order_index')
        .in('column_id', columnIds)
        .order('order_index', { ascending: true })
    : { data: [] as Record<string, unknown>[] };

  const doc: EditableDoc = {
    kind: 'story',
    id: project.id,
    name: project.name ?? '',
    // A storytelling written here has ONE column; the board's multi-column
    // saga is the full editor's business. New cards go on the first column,
    // and a project with none yet gets one at save time.
    columnId: columnIds[0] ?? null,
    stories: (stories ?? []).map((s) => toEditableStory(s as Record<string, unknown>)),
  };
  return NextResponse.json({ ok: true, doc });
}
