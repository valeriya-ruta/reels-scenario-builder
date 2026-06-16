import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { normalizeSlidesFromDb, slidesForDatabase } from '@/lib/carouselSlides';
import { carouselSignals } from '@/lib/content/contentKind';

export const runtime = 'nodejs';

/**
 * Carousel autosave endpoint (single source of truth for slide persistence).
 *
 * Why a Route Handler instead of the `saveCarouselSlides` Server Action:
 * Server Actions cap the request body at 1 MB. A slide with a base64 background
 * photo easily exceeds that, so the action threw "Body exceeded 1 MB limit" —
 * the real exception behind the silent autosave data loss (86d36eg0h) and the
 * export's "Не вдалося згенерувати слайди" (86d39dw6b, since the export
 * pre-saves before rendering). Route Handlers don't have that 1 MB cap, and
 * they can be hit with `fetch(..., { keepalive: true })` so a flush survives the
 * tab/app being backgrounded or closed.
 *
 * The editor AND the export read the same persisted row, so this write is the
 * canonical state. Slides are normalised + sanitised here (photo-typed slides
 * with no photo are coerced back to `color`, generated previews stripped) so a
 * bad client payload can never persist a state that exports black.
 */
export async function POST(req: Request) {
  let body: { project_id?: string; slides?: unknown };
  try {
    body = (await req.json()) as { project_id?: string; slides?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
  if (!projectId) {
    return NextResponse.json({ ok: false, error: 'Missing project_id' }, { status: 400 });
  }
  if (!Array.isArray(body.slides)) {
    return NextResponse.json({ ok: false, error: 'Missing slides' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // normalize → repair shape + coerce bad backgroundType; slidesForDatabase →
  // strip generated previews + final coercion before persisting.
  const persist = slidesForDatabase(normalizeSlidesFromDb(body.slides));

  const { error } = await supabase
    .from('carousel_projects')
    .update({ slides: persist, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', user.id);

  if (error) {
    console.error('[carousel/save] failed', { projectId, message: error.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Auto-promote Ідея → Скрипт the moment a carousel has real slide content
  // (Status system 5/8). Best-effort + never clobbers a manually-set later
  // status (Дизайн/Готово/…), and never breaks the core slide save above —
  // tolerant of the status column not yet existing (data-model migration gated).
  try {
    if (carouselSignals(null, persist).hasAuthoredWork) {
      const { data: row } = await supabase
        .from('carousel_projects')
        .select('status')
        .eq('id', projectId)
        .eq('user_id', user.id)
        .maybeSingle<{ status: string | null }>();
      if ((row?.status ?? 'idea') === 'idea') {
        await supabase
          .from('carousel_projects')
          .update({ status: 'script' })
          .eq('id', projectId)
          .eq('user_id', user.id);
      }
    }
  } catch (e) {
    console.warn('[carousel/save] status auto-promote skipped:', (e as Error)?.message);
  }

  return NextResponse.json({ ok: true });
}
