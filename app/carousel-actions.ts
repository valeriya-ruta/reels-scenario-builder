'use server';

import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { CarouselRantOutput, Slide } from '@/lib/carouselTypes';
import { createEmptySlide } from '@/lib/carouselSlides';
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

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clipName(value: string, maxLen = 64): string {
  const compact = compactWhitespace(value);
  if (!compact) return 'Нова карусель';
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen - 1).trimEnd()}…`;
}

function deriveCarouselNameFromRant(output: CarouselRantOutput, rant: string): string {
  const firstSlideTitle = output.slides
    .map((slide) => compactWhitespace((slide.title ?? '').replace(/[{}]/g, '')))
    .find(Boolean);
  if (firstSlideTitle) return clipName(firstSlideTitle);

  const firstSentence = compactWhitespace(rant).split(/[.!?]\s/)[0] ?? '';
  return clipName(firstSentence);
}

function mapRantOutputToDbSlides(output: CarouselRantOutput): Slide[] {
  return output.slides.map((raw, index) => {
    const slide = createEmptySlide();
    slide.title = compactWhitespace(raw.title ?? '');
    slide.body = compactWhitespace(raw.body ?? '');
    slide.layout = raw.layout === 'text_only' ? 'text_only' : 'title_and_text';
    slide.design_note = raw.design_note ?? null;
    slide.optionalLabel = raw.label != null ? compactWhitespace(String(raw.label)) || '' : '';
    slide.listItems = Array.isArray(raw.items)
      ? raw.items.map((item) => compactWhitespace(String(item))).filter(Boolean)
      : null;
    slide.icon = raw.icon != null ? compactWhitespace(String(raw.icon)) || null : null;
    slide.slideType = index === 0 ? 'cover' : index === output.slides.length - 1 ? 'final' : 'slide';
    slide.layoutPreset =
      slide.slideType === 'cover'
        ? null
        : slide.slideType === 'final'
          ? 'goal'
          : raw.type === 'statement'
            ? 'quote'
            : raw.type === 'bullets'
              ? 'list'
              : 'text';
    return slide;
  });
}

export async function createCarouselProjectFromRant(output: CarouselRantOutput, rant: string) {
  const user = await requireAuth();
  if (!user) return { ok: false as const, error: 'UNAUTHORIZED' as const };
  if (!output?.slides?.length) return { ok: false as const, error: 'EMPTY' as const };

  const supabase = await createServerSupabaseClient();
  const name = deriveCarouselNameFromRant(output, rant);
  const slides = slidesForDatabase(mapRantOutputToDbSlides(output));

  const { data: row, error } = await supabase
    .from('carousel_projects')
    .insert({
      user_id: user.id,
      name,
      slides,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !row) {
    console.error('Error creating rant carousel project:', error);
    return { ok: false as const, error: 'DB' as const };
  }

  return { ok: true as const, projectId: row.id };
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
