import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createCarouselProject, deleteCarouselProject } from '@/app/carousel-actions';
import SwipeableContentList from '@/components/content/SwipeableContentList';
import type { ContentPiece } from '@/lib/content/contentPiece';
import type { ContentStatus } from '@/lib/content/statusSystem';
import { attachPreviews } from '@/lib/content/contentPreview';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  user_id: string;
  name: string | null;
  status: string | null;
  scheduled_date: string | null;
  created_at: string;
  updated_at: string;
};

export default async function CarouselListPage() {
  const user = await requireAuth();
  if (!user) redirect('/');

  const supabase = await createServerSupabaseClient();
  const { data: projects, error } = await supabase
    .from('carousel_projects')
    .select('id, user_id, name, status, scheduled_date, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('[carousel] list query failed:', { message: error.message, code: error.code });
  }

  const rows: ContentPiece[] = ((projects as Row[] | null) ?? []).map((p) => ({
    id: p.id,
    userId: p.user_id,
    type: 'carousel',
    status: (p.status ?? 'idea') as ContentStatus,
    title: p.name?.trim() || 'Без назви',
    refTable: 'carousel_projects',
    scheduledDate: p.scheduled_date ?? null,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));

  // Cards preview the real designed output (cover slide / hook / opening
  // line) — the list row alone can't carry it.
  const pieces = await attachPreviews(rows);

  return (
    <div className="app-canvas">
      <div className="app-page">
        <SwipeableContentList
          pieces={pieces}
          heading="Каруселі"
          iconKey="carousel"
          accent="#5b7cfa"
          accentTint="#eef1ff"
          onCreate={createCarouselProject}
          onDelete={deleteCarouselProject}
          emptyText="Каруселей ще немає — ось із чого я б зробила першу"
        />
      </div>
    </div>
  );
}
