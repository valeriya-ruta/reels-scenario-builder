'use server';

import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { LabSlide } from '@/lib/carousel-lab/types';
import { slidesForDb } from '@/lib/carousel-lab/persist';
import { createProjectSlides } from '@/lib/carousel-lab/defaults';

const TABLE = 'carousel_lab_projects';

export async function createLabProject() {
  const user = await requireAuth();
  if (!user) redirect('/');
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: user.id,
      name: 'Нова карусель',
      style_id: 'modern-elegant',
      slides: slidesForDb(createProjectSlides()),
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[carousel-lab] create failed:', error);
    throw new Error(error?.message ?? 'Не вдалося створити карусель (перевір міграцію 028).');
  }
  redirect(`/carousel-lab/${data.id}`);
}

export async function deleteLabProject(projectId: string) {
  const user = await requireAuth();
  if (!user) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from(TABLE).delete().eq('id', projectId).eq('user_id', user.id);
}

export async function renameLabProject(projectId: string, name: string) {
  const user = await requireAuth();
  if (!user) return { ok: false as const };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ name: name.trim() || 'Нова карусель', updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', user.id);
  return error ? { ok: false as const } : { ok: true as const };
}

export async function updateLabStyle(projectId: string, styleId: string) {
  const user = await requireAuth();
  if (!user) return { ok: false as const };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ style_id: styleId, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', user.id);
  return error ? { ok: false as const } : { ok: true as const };
}

export async function saveLabSlides(projectId: string, slides: LabSlide[]) {
  const user = await requireAuth();
  if (!user) return { ok: false as const };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ slides: slidesForDb(slides), updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', user.id);
  if (error) {
    console.error('[carousel-lab] save failed:', error);
    return { ok: false as const };
  }
  return { ok: true as const };
}
