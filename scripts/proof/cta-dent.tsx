// Focused CTA-slide proof: renders the final/goal slide with a DARK background
// override so the accent CTA box is clearly visible (the auto case paints the
// box in the same colour as the slide, hiding it). Produces editor HTML + the
// real export PNG so shoot.mjs can compose them side by side and the dent/notch
// is inspectable in real pixels.
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Slide } from '@/lib/carouselTypes';
import { resolveSlideType } from '@/lib/carouselTypes';
import { createEmptySlide } from '@/lib/carouselSlides';
import type { BrandSettings } from '@/lib/brand';
import { getCarouselBrandPalette, resolveSlideVisualColors } from '@/lib/carousel/colorSystem';
import { renderCarouselTemplatePng } from '@/lib/carousel/carouselTemplateRender';
import CarouselSlidePreview from '@/components/carousel/CarouselSlidePreview';
import { resolveBrandFont } from '@/lib/brandFonts';

const OUT = '/tmp/proof';
mkdirSync(OUT, { recursive: true });

const FS = join(process.cwd(), 'node_modules', '@fontsource', 'montserrat', 'files');
const face = (subset: string, weight: number) =>
  `@font-face{font-family:'Montserrat';font-style:normal;font-weight:${weight};font-display:block;src:url('file://${join(FS, `montserrat-${subset}-${weight}-normal.woff2`)}') format('woff2');}`;
const CG = join(process.cwd(), 'node_modules', '@fontsource', 'cormorant-garamond', 'files');
const cgFace = (subset: string, weight: number) =>
  `@font-face{font-family:'Cormorant Garamond';font-style:normal;font-weight:${weight};font-display:block;src:url('file://${join(CG, `cormorant-garamond-${subset}-${weight}-normal.woff2`)}') format('woff2');}`;
const MONTSERRAT_FACE = [
  face('latin', 400),
  face('cyrillic', 400),
  face('latin', 700),
  face('cyrillic', 700),
  cgFace('latin', 400),
  cgFace('cyrillic', 400),
  cgFace('latin', 700),
  cgFace('cyrillic', 700),
].join('');

const VIBE = (process.env.VIBE as 'bold' | 'refined') || 'bold';
const brand: BrandSettings = {
  theme: 'light',
  vibe: VIBE,
  favColorHex: '#E05C40',
  colors: { lightBg: '#FAF9F7', darkBg: '#141414', accent1: '#E05C40', accent2: '#5D6B9F' },
  fontId: VIBE === 'refined' ? 'cormorant' : 'montserrat',
  accentStyle: 'marker',
};
const brandFont = resolveBrandFont(brand.fontId);
const palette = getCarouselBrandPalette(brand);

function makeSlides(): Slide[] {
  // Single-line body box.
  const a = createEmptySlide();
  a.slideType = 'final';
  a.layoutPreset = 'goal';
  a.title = 'Готові уникнути цих помилок?';
  a.body = 'Підпишись, щоб не пропустити';
  a.hasBackgroundOverride = true;
  a.backgroundColor = '#141414';

  // Multi-line body box (tests box height / corner geometry under wrapping).
  const b = createEmptySlide();
  b.slideType = 'final';
  b.layoutPreset = 'goal';
  b.title = 'Готові почати вже сьогодні?';
  b.body = 'Збережи цей пост і поділись з тим, кому це теж важливо прямо зараз';
  b.hasBackgroundOverride = true;
  b.backgroundColor = '#141414';

  return [a, b];
}

async function main() {
  const slides = makeSlides();
  const total = slides.length;

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideType = resolveSlideType(slide, i, total);
    const rv = resolveSlideVisualColors(slide, i, total, palette);
    const preset = slide.layoutPreset ?? 'goal';

    const png = await renderCarouselTemplatePng({
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
    writeFileSync(join(OUT, `export-${i + 1}.png`), png);

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
<style>${MONTSERRAT_FACE}html,body{margin:0;padding:0}#root{width:1080px;height:1350px}</style>
</head><body><div id="root">${markup}</div></body></html>`;
    writeFileSync(join(OUT, `editor-${i + 1}.html`), html);
    console.log(`slide ${i + 1}: ${slideType}/${preset} bg=${rv.backgroundColor} body="${slide.body}"`);
  }
  console.log('done →', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
