import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { CarouselProject } from '@/lib/domain';
import CarouselProjectsList from '@/components/CarouselProjectsList';
import CreateCarouselProjectButton from '@/components/CreateCarouselProjectButton';

export default async function CarouselListPage() {
  const user = await requireAuth();
  if (!user) redirect('/');

  const supabase = await createServerSupabaseClient();
  const { data: projects, error } = await supabase
    .from('carousel_projects')
    .select('id, user_id, name, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  // Avoid console.error here — Next dev overlay treats it as an app crash. PostgREST errors also log as {}.
  if (error) {
    console.warn('[carousel] list query failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {error && (
          <div
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="alert"
          >
            <p className="font-medium">Не вдалося завантажити список каруселей</p>
            <p className="mt-1 leading-normal text-amber-950/90">
              У Supabase, ймовірно, ще немає таблиці{' '}
              <code className="rounded bg-amber-100/80 px-1.5 py-0.5 font-mono text-[0.85em]">
                carousel_projects
              </code>
              . Відкрий SQL Editor і виконай файл міграції{' '}
              <code className="rounded bg-amber-100/80 px-1.5 py-0.5 font-mono text-[0.85em]">
                supabase/migrations/008_carousel_projects.sql
              </code>
              , або застосуй міграції через Supabase CLI.
            </p>
            {error.message ? (
              <p className="mt-2 font-mono text-xs text-amber-900/75">{error.message}</p>
            ) : null}
          </div>
        )}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-zinc-900">Мої каруселі</h1>
          <CreateCarouselProjectButton />
        </div>
        <CarouselProjectsList projects={(projects as CarouselProject[]) || []} />
      </div>
    </div>
  );
}
