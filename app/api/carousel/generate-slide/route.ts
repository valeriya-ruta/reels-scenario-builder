import { renderSlideImagePng } from '@/lib/carousel/renderSlideImage';
import { renderCarouselTemplatePng } from '@/lib/carousel/carouselTemplateRender';
import { sanitizeBgPhotoTransform } from '@/lib/carousel/bgPhotoTransform';
import { normalizeAccentStyle, type BrandAccentStyle } from '@/lib/brand';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type LegacyBody = {
  title?: string;
  body?: string;
  placement?: 'top' | 'center' | 'bottom';
  text_align?: 'left' | 'center' | 'right';
  background_type?: 'color' | 'gradient' | 'image';
  background_color?: string;
  gradient_mid_color?: string | null;
  gradient_end_color?: string | null;
  background_image_url?: string | null;
  background_image_base64?: string | null;
  title_color?: string;
  body_color?: string;
  slide_index?: number;
  total_slides?: number;
  title_size?: 'L' | 'M';
  body_size?: 'M' | 'S';
  bg_photo_transform?: {
    offset_x?: number;
    offset_y?: number;
    scale?: number;
  } | null;
};

type TemplateBody = LegacyBody & {
  slide_type?: 'cover' | 'slide' | 'final';
  layout_preset?: 'text' | 'quote' | 'testimonial' | 'list' | 'goal' | 'reaction' | null;
  label?: string | null;
  items?: string[] | null;
  icon?: string | null;
  bullet_style?: 'numbered-padded' | 'numbered-simple' | 'dots' | 'dashes' | 'checks' | 'cross-check' | null;
  testimonial_author?: { name: string; handle: string; avatar_url: string | null } | null;
  cta_action?: 'follow' | 'save' | 'share' | 'comment' | 'link' | null;
  cta_title?: string | null;
  cta_keyword?: string | null;
  design_note?: string | null;
  /** Skip template system and use legacy canvas renderer */
  use_legacy_renderer?: boolean;
  /** Passed through for Pillow / image pipeline (Prompt 1); optional on client. */
  overlay_type?: 'full' | 'backdrop' | 'frost' | 'gradient' | null;
  overlay_color?: string;
  overlay_opacity?: number;
};

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
  const watermarkDomain = appDomainFromEnv();
  let vibe: 'bold' | 'refined' = 'bold';
  let accentColor = '#e05c40';
  let primaryColor = '#faf9f7';
  let accentStyle: BrandAccentStyle = 'marker';
  let fontId = 'montserrat';

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
      const slideType =
        json.slide_type ??
        (slide_index === 1 ? 'cover' : slide_index === total_slides ? 'final' : 'slide');
      const layoutPreset =
        json.layout_preset ?? (slideType === 'final' ? 'goal' : slideType === 'cover' ? null : 'text');

      const png = await renderCarouselTemplatePng({
        slideType,
        layoutPreset,
        title: json.title ?? '',
        body: json.body ?? '',
        label: json.label ?? null,
        items: json.items ?? null,
        icon: json.icon ?? null,
        bulletStyle: json.bullet_style ?? null,
        testimonialAuthor: json.testimonial_author ?? null,
        ctaAction: json.cta_action ?? null,
        ctaTitle: json.cta_title ?? null,
        ctaKeyword: json.cta_keyword ?? null,
        titleSize: json.title_size ?? 'L',
        bodySize: json.body_size ?? 'M',
        backgroundType: json.background_type ?? 'color',
        backgroundColor: json.background_color ?? '#1A1A2E',
        gradientMidColor: json.gradient_mid_color ?? undefined,
        gradientEndColor: json.gradient_end_color ?? undefined,
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
    if (!['color', 'gradient', 'image'].includes(background_type)) {
      return NextResponse.json({ error: 'Invalid background_type' }, { status: 400 });
    }

    const png = await renderSlideImagePng({
      title: json.title ?? '',
      body: json.body ?? '',
      placement,
      text_align,
      background_type,
      background_color: json.background_color ?? '#1A1A2E',
      gradient_mid_color: json.gradient_mid_color ?? null,
      gradient_end_color: json.gradient_end_color ?? null,
      background_image_url: json.background_image_url ?? null,
      background_image_base64: json.background_image_base64 ?? null,
      title_color: json.title_color ?? '#FFFFFF',
      body_color: json.body_color ?? '#FFFFFF',
      slide_index,
      total_slides,
      accent_color: accentColor,
      accent_style: accentStyle,
      font_id: fontId,
      title_size: json.title_size ?? 'L',
      body_size: json.body_size ?? 'M',
      bg_photo_transform: sanitizeBgPhotoTransform(json.bg_photo_transform) ?? null,
    });
    return NextResponse.json({ image_base64: png.toString('base64') });
  } catch (e) {
    console.error('[carousel/generate-slide]', e);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
