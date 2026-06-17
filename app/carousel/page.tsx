import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import CreateCarouselProjectButton from '@/components/CreateCarouselProjectButton';
import ContentRowsSection from '@/components/content/ContentRowsSection';
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
    console.warn('[carousel] list query failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
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
      <div className="mx-auto max-w-2xl px-4 py-8">
        {error && (
          <div
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="alert"
          >
            <p className="font-medium">Не вдалося завантажити список каруселей</p>
            {error.message ? (
              <p className="mt-2 font-mono text-xs text-amber-900/75">{error.message}</p>
            ) : null}
          </div>
        )}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-zinc-900">Мої каруселі</h1>
          <CreateCarouselProjectButton />
        </div>
        <ContentRowsSection
          pieces={pieces}
          emptyText="Тут поки що нічого немає. Створи першу карусель, щоб відкрити студію."
        />
      </div>
    </div>
  );
}
