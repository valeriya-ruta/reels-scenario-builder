import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import CarouselPageClient from '@/components/CarouselPageClient';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { BrandSettings } from '@/lib/brand';
import { normalizeAccentStyle } from '@/lib/brand';
import { normalizeSlidesFromDb } from '@/lib/carouselSlides';
import type { Slide } from '@/lib/carouselTypes';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface BrandSettingsRow {
  theme: 'light' | 'dark';
  vibe: 'bold' | 'refined';
  fav_color_hex: string;
  color_light_bg: string;
  color_dark_bg: string;
  color_accent1: string;
  color_accent2: string;
  font_id: string;
}

function mapRow(row: BrandSettingsRow, accentFromProfile: string | null | undefined): BrandSettings {
  return {
    theme: row.theme,
    vibe: row.vibe,
    favColorHex: row.fav_color_hex,
    colors: {
      lightBg: row.color_light_bg,
      darkBg: row.color_dark_bg,
      accent1: row.color_accent1,
      accent2: row.color_accent2,
    },
    fontId: row.font_id,
    accentStyle: normalizeAccentStyle(accentFromProfile),
  };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CarouselStudioPage({ params }: PageProps) {
  const user = await requireAuth();
  if (!user) redirect('/');

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  // Use select('*') so missing optional columns (e.g. watermark_handle before migration 009)
  // do not make this query fail and bounce the user back to /carousel (looks like a dead link).
  const [{ data: projectRow, error: projectError }, { data: brandRow }, { data: profileRow }] =
    await Promise.all([
    supabase
      .from('carousel_projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('brand_settings')
      .select(
        'theme,vibe,fav_color_hex,color_light_bg,color_dark_bg,color_accent1,color_accent2,font_id',
      )
      .eq('user_id', user.id)
      .maybeSingle<BrandSettingsRow>(),
    supabase
      .from('profiles')
      .select('display_name,accent_style')
      .eq('id', user.id)
      .maybeSingle<{ display_name: string | null; accent_style: string | null }>(),
  ]);

  if (projectError || !projectRow) redirect('/carousel');

  const slides: Slide[] = normalizeSlidesFromDb(projectRow.slides);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col">
      <CarouselPageClient
        initialBrandSettings={
          brandRow ? mapRow(brandRow, profileRow?.accent_style) : null
        }
        carouselProject={{
          id: projectRow.id,
          name: projectRow.name,
          slides,
        }}
      />
    </div>
  );
}
