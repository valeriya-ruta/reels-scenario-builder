import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import LabEditor from '@/components/carousel-lab/LabEditor';
import { normalizeSlidesFromDb } from '@/lib/carousel-lab/persist';
import type { LabStyleId } from '@/lib/carousel-lab/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CarouselLabEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) redirect('/');

  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('carousel_lab_projects')
    .select('id, name, style_id, slides')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) redirect('/carousel-lab');

  return (
    <div className="mx-auto flex min-h-0 w-full flex-1 flex-col">
      <LabEditor
        projectId={data.id}
        initialName={data.name ?? 'Нова карусель'}
        initialStyleId={((data.style_id as LabStyleId) ?? 'modern-elegant')}
        initialSlides={normalizeSlidesFromDb(data.slides)}
      />
    </div>
  );
}
