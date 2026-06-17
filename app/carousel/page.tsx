import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createCarouselProject, deleteCarouselProject } from '@/app/carousel-actions';
import SwipeableContentList from '@/components/content/SwipeableContentList';
import type { ContentPiece } from '@/lib/content/contentPiece';
import type { ContentStatus } from '@/lib/content/statusSystem';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  user_id: string;
  name: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
};

export default async function CarouselListPage() {
  const user = await requireAuth();
  if (!user) redirect('/');

  const supabase = await createServerSupabaseClient();
  const { data: projects, error } = await supabase
    .from('carousel_projects')
    .select('id, user_id, name, status, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('[carousel] list query failed:', { message: error.message, code: error.code });
  }

  const pieces: ContentPiece[] = ((projects as Row[] | null) ?? []).map((p) => ({
    id: p.id,
    userId: p.user_id,
    type: 'carousel',
    status: (p.status ?? 'idea') as ContentStatus,
    title: p.name?.trim() || 'Без назви',
    refTable: 'carousel_projects',
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 py-8">
        <SwipeableContentList
          pieces={pieces}
          heading="Каруселі"
          iconKey="carousel"
          accent="#5b7cfa"
          accentTint="#eef1ff"
          onCreate={createCarouselProject}
          onDelete={deleteCarouselProject}
          emptyText="Тут поки що нічого немає. Створи першу карусель, щоб відкрити студію."
        />
      </div>
    </div>
  );
}
