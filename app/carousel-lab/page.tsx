import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import LabProjectsList, { type LabListItem } from '@/components/carousel-lab/LabProjectsList';
import { normalizeSlide } from '@/lib/carousel-lab/persist';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Row = { id: string; name: string | null; slides: unknown; updated_at: string };

export default async function CarouselLabListPage() {
  const user = await requireAuth();
  if (!user) redirect('/');

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('carousel_lab_projects')
    .select('id, name, slides, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) console.warn('[carousel-lab] list failed:', error.message);

  const items: LabListItem[] = ((data as Row[] | null) ?? []).map((r) => {
    const first = Array.isArray(r.slides) && r.slides.length ? normalizeSlide(r.slides[0]) : null;
    return { id: r.id, name: r.name ?? 'Без назви', cover: first, updatedAt: r.updated_at };
  });

  return (
    <div className="app-canvas">
      <div className="min-h-screen">
        <LabProjectsList items={items} />
      </div>
    </div>
  );
}
