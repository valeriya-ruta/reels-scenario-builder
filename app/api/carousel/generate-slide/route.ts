import { renderSlideImagePng } from '@/lib/carousel/renderSlideImage';
import { renderCarouselTemplatePng } from '@/lib/carousel/carouselTemplateRender';
import { normalizeAccentStyle, type BrandAccentStyle } from '@/lib/brand';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { SlideKind } from '@/lib/carouselTypes';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type LegacyBody = {
  title?: string;
  body?: string;
  placement?: 'top' | 'center' | 'bottom';
  text_align?: 'left' | 'center' | 'right';
  background_type?: 'color' | 'image';
  background_color?: string;
  background_image_url?: string | null;
  background_image_base64?: string | null;
  title_color?: string;
  body_color?: string;
  slide_index?: number;
  total_slides?: number;
};

type TemplateBody = LegacyBody & {
  slide_kind?: SlideKind;
  label?: string | null;
  items?: string[] | null;
  icon?: string | null;
  design_note?: string | null;
  /** Skip template system and use legacy canvas renderer */
  use_legacy_renderer?: boolean;
  /** Passed through for Pillow / image pipeline (Prompt 1); optional on client. */
  overlay_type?: 'full' | 'backdrop' | 'frost' | 'gradient' | null;
  overlay_color?: string;
  overlay_opacity?: number;
};

function inferSlideKind(explicit: SlideKind | undefined, idx: number, total: number): SlideKind {
  if (explicit) return explicit;
  if (total <= 1) return 'content';
  if (idx === 0) return 'cover';
  if (idx === total - 1) return 'cta';
  return 'content';
}

function appDomainFromEnv(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return '';
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return u.hostname || '';
  } catch {
    return '';
  }
}

export async function POST(req: Request) {
  let json: TemplateBody;
  try {
    json = (await req.json()) as TemplateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  void json.overlay_type;
  void json.overlay_color;
  void json.overlay_opacity;

  const slide_index = Number(json.slide_index);
  const total_slides = Number(json.total_slides);

  if (!Number.isFinite(slide_index) || slide_index < 1) {
    return NextResponse.json({ error: 'Invalid slide_index' }, { status: 400 });
  }
  if (!Number.isFinite(total_slides) || total_slides < 1) {
    return NextResponse.json({ error: 'Invalid total_slides' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let watermarkHandle = '';
  let watermarkDomain = appDomainFromEnv();
  let vibe: 'bold' | 'refined' = 'bold';
  let accentColor = '#e05c40';
  let primaryColor = '#faf9f7';
  let accentStyle: BrandAccentStyle = 'marker';
  let fontId = 'manrope';

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name,accent_style')
      .eq('id', user.id)
      .maybeSingle<{ display_name: string | null; accent_style: string | null }>();

    const dn = profile?.display_name?.trim();
    if (dn) {
      const slug = dn.replace(/\s+/g, '').replace(/^@+/, '');
      watermarkHandle = slug ? `@${slug}` : dn;
    }
    accentStyle = normalizeAccentStyle(profile?.accent_style);

    const { data: brand } = await supabase
      .from('brand_settings')
      .select('vibe,color_light_bg,color_accent1,font_id')
      .eq('user_id', user.id)
      .maybeSingle<{
        vibe: string | null;
        color_light_bg: string | null;
        color_accent1: string | null;
        font_id: string | null;
      }>();

    if (brand) {
      if (brand.vibe === 'refined') vibe = 'refined';
      if (brand.color_accent1?.trim()) accentColor = brand.color_accent1.trim();
      if (brand.color_light_bg?.trim()) primaryColor = brand.color_light_bg.trim();
      if (brand.font_id?.trim()) fontId = brand.font_id.trim();
    }
  }

  const useLegacy =
    json.use_legacy_renderer === true ||
    (json.background_type === 'image' && Boolean(json.background_image_url || json.background_image_base64));

  try {
    if (!useLegacy) {
      const slideKind = inferSlideKind(json.slide_kind, slide_index - 1, total_slides);

      const png = await renderCarouselTemplatePng({
        slideKind,
        title: json.title ?? '',
        body: json.body ?? '',
        label: json.label ?? null,
        items: json.items ?? null,
        icon: json.icon ?? null,
        designNote: json.design_note ?? null,
        slideIndex: slide_index,
        totalSlides: total_slides,
        brand: {
          vibe,
          primaryColor,
          accentColor,
          accentStyle,
          fontPairing: fontId,
        },
        handle: watermarkHandle,
        domain: watermarkDomain,
      });
      return NextResponse.json({ image_base64: png.toString('base64') });
    }

    const placement = json.placement ?? 'center';
    const text_align = json.text_align ?? 'left';
    const background_type = json.background_type ?? 'color';

    if (!['top', 'center', 'bottom'].includes(placement)) {
      return NextResponse.json({ error: 'Invalid placement' }, { status: 400 });
    }
    if (!['left', 'center', 'right'].includes(text_align)) {
      return NextResponse.json({ error: 'Invalid text_align' }, { status: 400 });
    }
    if (!['color', 'image'].includes(background_type)) {
      return NextResponse.json({ error: 'Invalid background_type' }, { status: 400 });
    }

    const png = await renderSlideImagePng({
      title: json.title ?? '',
      body: json.body ?? '',
      placement,
      text_align,
      background_type,
      background_color: json.background_color ?? '#1A1A2E',
      background_image_url: json.background_image_url ?? null,
      background_image_base64: json.background_image_base64 ?? null,
      title_color: json.title_color ?? '#FFFFFF',
      body_color: json.body_color ?? '#FFFFFF',
      slide_index,
      total_slides,
      accent_color: accentColor,
      accent_style: accentStyle,
    });
    return NextResponse.json({ image_base64: png.toString('base64') });
  } catch (e) {
    console.error('[carousel/generate-slide]', e);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
