'use server';

import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { Slide } from '@/lib/carouselTypes';
import { slidesForDatabase } from '@/lib/carouselSlides';

export async function createCarouselProject() {
  const user = await requireAuth();
  if (!user) redirect('/');

  const supabase = await createServerSupabaseClient();
  const { data: row, error } = await supabase
    .from('carousel_projects')
    .insert({ name: 'Без назви', user_id: user.id })
    .select()
    .single();

  if (error || !row) {
    console.error('Error creating carousel project:', error);
    throw new Error(
      error?.message ?? 'Не вдалося створити карусель. Перевір, чи застосована міграція carousel_projects у Supabase.',
    );
  }

  redirect(`/carousel/${row.id}`);
}

export async function updateCarouselProjectName(projectId: string, name: string) {
  const user = await requireAuth();
  if (!user) return;
  const supabase = await createServerSupabaseClient();
  await supabase
    .from('carousel_projects')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', user.id);
}

export async function deleteCarouselProject(projectId: string) {
  const user = await requireAuth();
  if (!user) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from('carousel_projects').delete().eq('id', projectId).eq('user_id', user.id);
}

export async function saveCarouselSlides(projectId: string, slides: Slide[]) {
  const user = await requireAuth();
  if (!user) return { ok: false as const };
  const supabase = await createServerSupabaseClient();
  const persist = slidesForDatabase(slides);
  const { error } = await supabase
    .from('carousel_projects')
    .update({
      slides: persist,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('user_id', user.id);
  if (error) {
    console.error('saveCarouselSlides', error);
    return { ok: false as const };
  }
  return { ok: true as const };
}

export async function updateCarouselWatermarkHandle(projectId: string, watermarkHandle: string) {
  const user = await requireAuth();
  if (!user) return { ok: false as const };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('carousel_projects')
    .update({
      watermark_handle: watermarkHandle.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('user_id', user.id);
  if (error) {
    console.error('updateCarouselWatermarkHandle', error);
    return { ok: false as const };
  }
  return { ok: true as const };
}
