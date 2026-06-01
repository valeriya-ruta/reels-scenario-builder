import { renderSlideImagePng } from '@/lib/carousel/renderSlideImage';
import { renderCarouselTemplatePng } from '@/lib/carousel/carouselTemplateRender';
import { sanitizeBgPhotoTransform } from '@/lib/carousel/bgPhotoTransform';
import { normalizeAccentStyle, type BrandAccentStyle } from '@/lib/brand';
import { getCarouselBrandPalette, resolveSlideVisualColors } from '@/lib/carousel/colorSystem';
import { normalizeSlidesFromDb } from '@/lib/carouselSlides';
import type { Slide } from '@/lib/carouselTypes';
import { resolveSlideType } from '@/lib/carouselTypes';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * The export renders from the SAME persisted slide model the editor uses
 * (single canonical source of truth). The client only identifies WHICH slide
 * to render via `project_id` + `slide_index`; it no longer ships a lossy copy
 * of the slide's visual state. Brand/profile are still fetched server-side.
 */
type ExportBody = {
  project_id?: string;
  slide_index?: number;
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

function slideHasPhoto(slide: Slide): boolean {
  return (
    slide.backgroundType === 'image' &&
    Boolean(
      (slide.backgroundImageUrl && slide.backgroundImageUrl.trim().length > 0) ||
        (slide.backgroundImageBase64 && slide.backgroundImageBase64.trim().length > 0),
    )
  );
}

export async function POST(req: Request) {
  let json: ExportBody;
  try {
    json = (await req.json()) as ExportBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = typeof json.project_id === 'string' ? json.project_id.trim() : '';
  const slide_index = Number(json.slide_index);

  if (!projectId) {
    return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  }
  if (!Number.isFinite(slide_index) || slide_index < 1) {
    return NextResponse.json({ error: 'Invalid slide_index' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ---- Brand / profile (server-side source of truth, unchanged) ----
  let watermarkHandle = '';
  const watermarkDomain = appDomainFromEnv();
  let vibe: 'bold' | 'refined' = 'bold';
  let accentColor = '#e05c40';
  let primaryColor = '#faf9f7';
  let accentStyle: BrandAccentStyle = 'marker';
  let fontId = 'montserrat';
  let darkColor = '#141414';
  let accent2Color = '#5D6B9F';

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

  // ---- Load the PERSISTED slide model (canonical source of truth) ----
  const { data: projectRow, error: projectError } = await supabase
    .from('carousel_projects')
    .select('slides')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single<{ slides: unknown }>();

  if (projectError || !projectRow) {
    return NextResponse.json({ error: 'Carousel not found' }, { status: 404 });
  }

  const slides = normalizeSlidesFromDb(projectRow.slides);
  const total_slides = slides.length;
  if (slide_index > total_slides) {
    return NextResponse.json({ error: 'slide_index out of range' }, { status: 400 });
  }
  const slide = slides[slide_index - 1];

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
  // resolveSlideVisualColors honours the slide's stored title/body color when
  // textColorUserSet/textColorAutoSet is set (now present on the persisted
  // model) — so the export no longer recomputes/overrides the editor's color.
  const resolvedVisual = resolveSlideVisualColors(slide, slide_index - 1, total_slides, palette);

  const hasPhoto = slideHasPhoto(slide);
  const useLegacy = slide.backgroundType === 'image' && hasPhoto;
  const slideType = resolveSlideType(slide, slide_index - 1, total_slides);

  try {
    if (!useLegacy) {
      const layoutPreset =
        slide.layoutPreset ?? (slideType === 'final' ? 'goal' : slideType === 'cover' ? null : 'text');

      const png = await renderCarouselTemplatePng({
        slideType,
        layoutPreset,
        title: slide.title ?? '',
        body: slide.body ?? '',
        textAlign: slide.textAlign ?? 'left',
        label: slide.optionalLabel ?? null,
        items: slide.listItems ?? slide.items ?? null,
        icon: slide.icon ?? null,
        bulletStyle: slide.bulletStyle ?? null,
        testimonialAuthor: slide.testimonialAuthor ?? null,
        ctaAction: slide.ctaAction ?? null,
        ctaTitle: slide.ctaTitle ?? null,
        ctaKeyword: slide.ctaKeyword ?? null,
        titleSize: slide.titleSize ?? 'L',
        bodySize: slide.bodySize ?? 'M',
        backgroundType: slide.backgroundType ?? 'color',
        backgroundColor: resolvedVisual.backgroundColor,
        gradientMidColor: slide.gradientMidColor ?? undefined,
        gradientEndColor: slide.gradientEndColor ?? undefined,
        titleColor: resolvedVisual.titleColor,
        bodyColor: resolvedVisual.bodyColor,
        designNote: slide.design_note ?? null,
        slideIndex: slide_index,
        totalSlides: total_slides,
        palette: {
          light: palette.light,
          accent1: palette.accent1,
          accent2: palette.accent2,
          dark: palette.dark,
        },
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

    const png = await renderSlideImagePng({
      title: slide.title ?? '',
      body: slide.body ?? '',
      placement: slide.placement ?? 'center',
      text_align: slide.textAlign ?? 'left',
      background_type: 'image',
      background_color: resolvedVisual.backgroundColor,
      gradient_mid_color: slide.gradientMidColor ?? null,
      gradient_end_color: slide.gradientEndColor ?? null,
      background_image_url: slide.backgroundImageUrl ?? null,
      background_image_base64: slide.backgroundImageBase64 ?? null,
      title_color: resolvedVisual.titleColor,
      body_color: resolvedVisual.bodyColor,
      slide_index,
      total_slides,
      accent_color: accentColor,
      accent_style: accentStyle,
      font_id: fontId,
      title_size: slide.titleSize ?? 'L',
      body_size: slide.bodySize ?? 'M',
      bg_photo_transform: sanitizeBgPhotoTransform(slide.bgPhotoTransform) ?? null,
      overlay_type: slide.overlayType ?? null,
      overlay_color: slide.overlayColor ?? darkColor,
      overlay_opacity: typeof slide.overlayOpacity === 'number' ? slide.overlayOpacity : 50,
    });
    return NextResponse.json({ image_base64: png.toString('base64') });
  } catch (e) {
    const err = e as Error;
    const errMsg = err?.message ?? String(e);
    const errStack = err?.stack ?? null;
    console.error(
      '[carousel/generate-slide] failed',
      JSON.stringify({
        message: errMsg,
        stack: errStack,
        projectId,
        slideIndex: slide_index,
        totalSlides: total_slides,
        slideType,
        layoutPreset: slide.layoutPreset ?? null,
        backgroundType: slide.backgroundType ?? null,
        useLegacy,
        fontId,
      }),
    );
    return NextResponse.json(
      { error: `Generation failed: ${errMsg}` },
      { status: 500 },
    );
  }
}
