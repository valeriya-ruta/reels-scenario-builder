import { renderSlideImagePng } from '@/lib/carousel/renderSlideImage';
import { renderCarouselTemplatePng } from '@/lib/carousel/carouselTemplateRender';
import { sanitizeBgPhotoTransform } from '@/lib/carousel/bgPhotoTransform';
import { normalizeAccentStyle, type BrandAccentStyle } from '@/lib/brand';
import { getCarouselBrandPalette, resolveSlideVisualColors } from '@/lib/carousel/colorSystem';
import type { Slide } from '@/lib/carouselTypes';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type LegacyBody = {
  title?: string;
  body?: string;
  placement?: 'top' | 'center' | 'bottom';
  text_align?: 'left' | 'center' | 'right';
  background_type?: 'color' | 'gradient' | 'image';
  has_background_override?: boolean;
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
  let darkColor = '#141414';
  let accent2Color = '#5D6B9F';

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
      .select('vibe,color_light_bg,color_dark_bg,color_accent1,color_accent2,font_id')
      .eq('user_id', user.id)
      .maybeSingle<{
        vibe: string | null;
        color_light_bg: string | null;
        color_dark_bg: string | null;
        color_accent1: string | null;
        color_accent2: string | null;
        font_id: string | null;
      }>();

    if (brand) {
      if (brand.vibe === 'refined') vibe = 'refined';
      if (brand.color_accent1?.trim()) accentColor = brand.color_accent1.trim();
      if (brand.color_accent2?.trim()) accent2Color = brand.color_accent2.trim();
      if (brand.color_light_bg?.trim()) primaryColor = brand.color_light_bg.trim();
      if (brand.color_dark_bg?.trim()) darkColor = brand.color_dark_bg.trim();
      if (brand.font_id?.trim()) fontId = brand.font_id.trim();
    }
  }

  const pseudoSlide: Slide = {
    id: 'render',
    title: json.title ?? '',
    body: json.body ?? '',
    placement: json.placement ?? 'center',
    textAlign: json.text_align ?? 'left',
    layout: 'title_and_text',
    design_note: json.design_note ?? null,
    slideKind: undefined,
    label: json.label ?? null,
    items: json.items ?? null,
    icon: json.icon ?? null,
    backgroundType: json.background_type ?? 'color',
    hasBackgroundOverride: json.has_background_override === true,
    backgroundColor: json.background_color ?? primaryColor,
    gradientMidColor: json.gradient_mid_color ?? undefined,
    gradientEndColor: json.gradient_end_color ?? undefined,
    backgroundImageUrl: json.background_image_url ?? null,
    backgroundImageBase64: json.background_image_base64 ?? null,
    bgPhotoTransform: sanitizeBgPhotoTransform(json.bg_photo_transform) ?? undefined,
    titleColor: json.title_color ?? accentColor,
    bodyColor: json.body_color ?? '#000000',
    generatedImageBase64: null,
    overlayType: json.overlay_type ?? null,
    overlayColor: json.overlay_color ?? darkColor,
    overlayOpacity: typeof json.overlay_opacity === 'number' ? json.overlay_opacity : 50,
    slideType: json.slide_type ?? (slide_index === 1 ? 'cover' : slide_index === total_slides ? 'final' : 'slide'),
    layoutPreset: json.layout_preset ?? (slide_index === total_slides ? 'goal' : 'text'),
    optionalLabel: json.label ?? '',
    listItems: json.items ?? null,
    bulletStyle: json.bullet_style ?? 'numbered-padded',
    testimonialAuthor: json.testimonial_author ?? null,
    ctaAction: json.cta_action ?? 'follow',
    ctaTitle: json.cta_title ?? '',
    ctaKeyword: json.cta_keyword ?? '',
    titleSize: json.title_size ?? 'L',
    bodySize: json.body_size ?? 'M',
  };
  const palette = getCarouselBrandPalette({
    theme: 'light',
    vibe,
    favColorHex: accentColor,
    colors: {
      lightBg: primaryColor,
      darkBg: darkColor,
      accent1: accentColor,
      accent2: accent2Color,
    },
    fontId,
    accentStyle,
  });
  const resolvedVisual = resolveSlideVisualColors(pseudoSlide, slide_index - 1, total_slides, palette);

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
        backgroundColor: resolvedVisual.backgroundColor,
        gradientMidColor: json.gradient_mid_color ?? undefined,
        gradientEndColor: json.gradient_end_color ?? undefined,
        titleColor: resolvedVisual.titleColor,
        bodyColor: resolvedVisual.bodyColor,
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
      background_color: resolvedVisual.backgroundColor,
      gradient_mid_color: json.gradient_mid_color ?? null,
      gradient_end_color: json.gradient_end_color ?? null,
      background_image_url: json.background_image_url ?? null,
      background_image_base64: json.background_image_base64 ?? null,
      title_color: resolvedVisual.titleColor,
      body_color: resolvedVisual.bodyColor,
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
