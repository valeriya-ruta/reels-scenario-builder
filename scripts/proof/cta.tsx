// Focused CTA proof: render the goal/final slide with a VISIBLE accent box
// (dark background so the box contrasts) at several body lengths, both the real
// editor component and the real export renderer, then a sibling shoot composes.
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Slide } from '@/lib/carouselTypes';
import { createEmptySlide } from '@/lib/carouselSlides';
import type { BrandSettings } from '@/lib/brand';
import { getCarouselBrandPalette } from '@/lib/carousel/colorSystem';
import { renderCarouselTemplatePng } from '@/lib/carousel/carouselTemplateRender';
import CarouselSlidePreview from '@/components/carousel/CarouselSlidePreview';
import { resolveBrandFont } from '@/lib/brandFonts';

const OUT = process.env.OUT || '/tmp/proof-cta';
mkdirSync(OUT, { recursive: true });

const FS = join(process.cwd(), 'node_modules', '@fontsource', 'montserrat', 'files');
const face = (subset: string, weight: number) =>
  `@font-face{font-family:'Montserrat';font-style:normal;font-weight:${weight};font-display:block;src:url('file://${join(FS, `montserrat-${subset}-${weight}-normal.woff2`)}') format('woff2');}`;
const MONTSERRAT_FACE = [face('latin', 400), face('cyrillic', 400), face('latin', 700), face('cyrillic', 700)].join('');

const VIBE = (process.env.VIBE as 'bold' | 'refined') || 'bold';
const brand: BrandSettings = {
  theme: 'light',
  vibe: VIBE,
  favColorHex: '#E05C40',
  colors: { lightBg: '#FAF9F7', darkBg: '#141414', accent1: '#E05C40', accent2: '#5D6B9F' },
  fontId: 'montserrat',
  accentStyle: 'marker',
};
const brandFont = resolveBrandFont(brand.fontId);
const palette = getCarouselBrandPalette(brand);

function ctaSlide(body: string): Slide {
  const s = createEmptySlide();
  s.slideType = 'final';
  s.layoutPreset = 'goal';
  s.title = 'Готові уникнути цих помилок?';
  s.body = body;
  s.ctaAction = 'follow';
  // Force a DARK custom background so the accent box is visible (this is where
  // any box-edge / dent artifact shows up).
  s.backgroundType = 'color';
  s.hasBackgroundOverride = true;
  s.backgroundColor = '#141414';
  s.titleColor = '#FFFFFF';
  s.bodyColor = '#FFFFFF';
  s.textColorUserSet = true;
  return s;
}

const cases: { body: string }[] = [
  { body: 'Підпишись' },
  { body: 'Підпишись, щоб не пропустити наступні розбори' },
  { body: 'Натисни підписатися та збережи цей пост, щоб повернутися до нього пізніше і не загубити' },
];

async function main() {
  for (let i = 0; i < cases.length; i++) {
    const slide = ctaSlide(cases[i].body);
    const png = await renderCarouselTemplatePng({
      slideType: 'final',
      layoutPreset: 'goal',
      title: slide.title,
      body: slide.body,
      textAlign: 'left',
      placement: 'center',
      label: null,
      items: null,
      icon: null,
      bulletStyle: null,
      testimonialAuthor: null,
      ctaAction: slide.ctaAction ?? null,
      ctaTitle: null,
      ctaKeyword: null,
      titleSize: 'L',
      bodySize: 'M',
      backgroundType: 'color',
      backgroundColor: slide.backgroundColor,
      titleColor: slide.titleColor,
      bodyColor: slide.bodyColor,
      designNote: null,
      slideIndex: 5,
      totalSlides: 5,
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

    const editorSlide: Slide = { ...slide, textColorAutoSet: true };
    const markup = renderToStaticMarkup(
      React.createElement(CarouselSlidePreview, {
        slide: editorSlide,
        brand,
        brandFont,
        scale: 1,
        slideIndex: 5,
        totalSlides: 5,
      }),
    );
    const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${join(OUT, 'tw.css')}">
<style>${MONTSERRAT_FACE}html,body{margin:0;padding:0}#root{width:1080px;height:1350px}</style>
</head><body><div id="root">${markup}</div></body></html>`;
    writeFileSync(join(OUT, `editor-${i + 1}.html`), html);
    console.log(`cta case ${i + 1}: body len=${cases[i].body.length}`);
  }
  console.log('done →', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
