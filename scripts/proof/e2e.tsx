// End-to-end equivalent pass (local, against the REAL renderers + components):
// build a 3-slide carousel (color cover + photo + CTA), round-trip it through the
// persisted-model serializer (autosave fidelity / single source of truth), then
// for each slide render the EXPORT exactly like app/api/carousel/generate-slide
// AND the EDITOR (CarouselSlidePreview). A sibling script shoots + composes them.
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Slide } from '@/lib/carouselTypes';
import { resolveSlideType } from '@/lib/carouselTypes';
import { createEmptySlide, slidesForDatabase, normalizeSlidesFromDb } from '@/lib/carouselSlides';
import type { BrandSettings } from '@/lib/brand';
import { resolveBrandFont } from '@/lib/brandFonts';
import { getCarouselBrandPalette, resolveSlideVisualColors } from '@/lib/carousel/colorSystem';
import { renderCarouselTemplatePng } from '@/lib/carousel/carouselTemplateRender';
import { renderSlideImagePng } from '@/lib/carousel/renderSlideImage';
import { sanitizeBgPhotoTransform } from '@/lib/carousel/bgPhotoTransform';
import CarouselSlidePreview from '@/components/carousel/CarouselSlidePreview';

const OUT = '/tmp/proof';
mkdirSync(OUT, { recursive: true });
const PHOTO = readFileSync('/tmp/proof/photo.b64', 'utf8').trim();

const brand: BrandSettings = {
  theme: 'light',
  vibe: 'bold',
  favColorHex: '#E05C40',
  colors: { lightBg: '#FAF9F7', darkBg: '#141414', accent1: '#E05C40', accent2: '#5D6B9F' },
  fontId: 'montserrat',
  accentStyle: 'marker',
};
const brandFont = resolveBrandFont(brand.fontId);
const palette = getCarouselBrandPalette(brand);

function build(): Slide[] {
  const cover = createEmptySlide();
  cover.slideType = 'cover';
  cover.layoutPreset = null;
  cover.title = '5 помилок у запуску';
  cover.body = 'Які з’їдають твій бюджет';

  const photo = createEmptySlide();
  photo.slideType = 'slide';
  photo.layoutPreset = 'text';
  photo.optionalLabel = 'Помилка №1';
  photo.title = 'Без чіткого офера';
  photo.body = 'Люди не розуміють, що саме ти пропонуєш і чому це варте уваги.';
  photo.backgroundType = 'image';
  photo.backgroundImageBase64 = PHOTO;
  photo.overlayType = 'full';
  photo.overlayColor = '#141414';
  photo.overlayOpacity = 55;

  const cta = createEmptySlide();
  cta.slideType = 'final';
  cta.layoutPreset = 'goal';
  cta.title = 'Збережи, щоб не злити бюджет';
  cta.ctaAction = 'save';

  return [cover, photo, cta];
}

async function main() {
  // 1) "edit text" done above. 2) close/reopen = autosave round-trip:
  const persisted = slidesForDatabase(build());
  const slides = normalizeSlidesFromDb(persisted); // what the editor + export both read on reopen
  const total = slides.length;

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideType = resolveSlideType(slide, i, total);
    const rv = resolveSlideVisualColors(slide, i, total, palette);
    const hasPhoto =
      slide.backgroundType === 'image' && Boolean(slide.backgroundImageBase64 || slide.backgroundImageUrl);
    const useLegacy = slide.backgroundType === 'image' && hasPhoto;

    let png: Buffer;
    if (!useLegacy) {
      const preset =
        slide.layoutPreset ?? (slideType === 'final' ? 'goal' : slideType === 'cover' ? null : 'text');
      png = await renderCarouselTemplatePng({
        slideType,
        layoutPreset: preset,
        title: slide.title ?? '',
        body: slide.body ?? '',
        textAlign: slide.textAlign ?? 'left',
        placement: slide.placement ?? 'center',
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
        backgroundColor: rv.backgroundColor,
        gradientMidColor: slide.gradientMidColor ?? undefined,
        gradientEndColor: slide.gradientEndColor ?? undefined,
        titleColor: rv.titleColor,
        bodyColor: rv.bodyColor,
        designNote: slide.design_note ?? null,
        slideIndex: i + 1,
        totalSlides: total,
        palette,
        brand: {
          vibe: brand.vibe,
          primaryColor: brand.colors.lightBg,
          accentColor: brand.colors.accent1,
          accentStyle: brand.accentStyle,
          fontPairing: brand.fontId,
        },
        handle: '@ruta.media',
        domain: 'web.ruta.media',
      });
    } else {
      const tSize = slide.titleSize ?? 'L';
      const bSize = slide.bodySize ?? 'M';
      const legacyTitlePx =
        slideType === 'cover' ? (tSize === 'M' ? 70 : 88)
        : slideType === 'final' ? (tSize === 'M' ? 58 : 72)
        : (tSize === 'M' ? 52 : 64);
      const legacyBodyPx = slideType === 'cover' ? 26 : bSize === 'S' ? 27 : 34;
      const isContentSlide = slideType === 'slide' && (slide.layoutPreset === 'text' || !slide.layoutPreset);
      png = await renderSlideImagePng({
        title: slide.title ?? '',
        body: slide.body ?? '',
        placement: slide.placement ?? 'center',
        text_align: slideType === 'cover' ? 'center' : slide.textAlign ?? 'left',
        title_px: legacyTitlePx,
        body_px: legacyBodyPx,
        label: isContentSlide ? slide.optionalLabel ?? null : null,
        background_type: 'image',
        background_color: rv.backgroundColor,
        gradient_mid_color: slide.gradientMidColor ?? null,
        gradient_end_color: slide.gradientEndColor ?? null,
        background_image_url: slide.backgroundImageUrl ?? null,
        background_image_base64: slide.backgroundImageBase64 ?? null,
        title_color: rv.titleColor,
        body_color: rv.bodyColor,
        slide_index: i + 1,
        total_slides: total,
        accent_color: brand.colors.accent1,
        accent_style: brand.accentStyle,
        font_id: brand.fontId,
        title_size: slide.titleSize ?? 'L',
        body_size: slide.bodySize ?? 'M',
        bg_photo_transform: sanitizeBgPhotoTransform(slide.bgPhotoTransform) ?? null,
        overlay_type: slide.overlayType ?? null,
        overlay_color: slide.overlayColor ?? brand.colors.darkBg,
        overlay_opacity: typeof slide.overlayOpacity === 'number' ? slide.overlayOpacity : 50,
      });
    }
    writeFileSync(join(OUT, `e2e-export-${i + 1}.png`), png);

    const editorSlide: Slide = { ...slide, ...rv, textColorAutoSet: true };
    const markup = renderToStaticMarkup(
      React.createElement(CarouselSlidePreview, {
        slide: editorSlide,
        brand,
        brandFont,
        scale: 1,
        slideIndex: i + 1,
        totalSlides: total,
      }),
    );
    const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///tmp/proof/tw.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Montserrat:wght@400;700&display=swap" rel="stylesheet">
<style>html,body{margin:0;padding:0}#root{width:1080px;height:1350px}</style>
</head><body><div id="root">${markup}</div></body></html>`;
    writeFileSync(join(OUT, `e2e-editor-${i + 1}.html`), html);
    console.log(`slide ${i + 1}: ${slideType}/${slide.layoutPreset} legacy=${useLegacy} bg=${rv.backgroundColor} title=${rv.titleColor}`);
  }

  // Autosave fidelity check: re-serialize and compare to the first persisted form.
  const reserialized = slidesForDatabase(slides);
  const stable = JSON.stringify(reserialized) === JSON.stringify(persisted);
  console.log('autosave round-trip stable:', stable);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
