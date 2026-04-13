import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import SettingsClient from '@/components/SettingsClient';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { BrandSettings } from '@/lib/brand';

interface BrandSettingsRow {
  theme: 'light' | 'dark';
  vibe: 'bold' | 'refined';
  fav_color_hex: string;
  color_light_bg: string;
  color_dark_bg: string;
  color_accent1: string;
  color_accent2: string;
  title_font: string;
  body_font: string;
}

function mapRow(row: BrandSettingsRow): BrandSettings {
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
    titleFont: row.title_font,
    bodyFont: row.body_font,
  };
}

export default async function SettingsPage() {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('brand_settings')
    .select(
      'theme,vibe,fav_color_hex,color_light_bg,color_dark_bg,color_accent1,color_accent2,title_font,body_font',
    )
    .eq('user_id', user.id)
    .maybeSingle<BrandSettingsRow>();

  return <SettingsClient initialBrandSettings={data ? mapRow(data) : null} />;
}
