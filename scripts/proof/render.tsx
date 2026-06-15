// Dev-only verification harness (not shipped). Generates, for a set of test
// slides: (a) the REAL export PNG via renderCarouselTemplatePng, and (b) an HTML
// snapshot of the REAL editor component CarouselSlidePreview. A sibling script
// screenshots the HTML in Chromium and composes editor-vs-export side by side.
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

// Local Montserrat (latin + cyrillic, 400 + 700) so the editor HTML screenshot
// renders the REAL brand font offline — the Google Fonts CDN is network-blocked
// here, and the export already uses these same @fontsource files.
const FS = join(process.cwd(), 'node_modules', '@fontsource', 'montserrat', 'files');
const face = (subset: string, weight: number) =>
  `@font-face{font-family:'Montserrat';font-style:normal;font-weight:${weight};font-display:block;src:url('file://${join(FS, `montserrat-${subset}-${weight}-normal.woff2`)}') format('woff2');}`;
const MONTSERRAT_FACE = [
  face('latin', 400),
  face('cyrillic', 400),
  face('latin', 700),
  face('cyrillic', 700),
].join('');

// Default brand: bold vibe, Montserrat, brand red accent — same as the export
// route's defaults / the deployed build.
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

function makeSlides(): Slide[] {
  // 1) Cover (first slide): title + subline, color bg (auto = accent1).
  const cover = createEmptySlide();
  cover.slideType = 'cover';
  cover.layoutPreset = null;
  cover.title = 'Як ми втратили 700 клієнтів';
  cover.body = 'Історія однієї дорогої помилки';
  cover.hasBackgroundOverride = false;

  // 2) Content slide WITH a label pill (the reported bug case).
  const content = createEmptySlide();
  content.slideType = 'slide';
  content.layoutPreset = 'text';
  content.optionalLabel = 'Що може піти не так';
  content.title = 'Історія зі втратою 700';
  content.body = 'Коли все йде не за планом, важливо зберігати спокій і діяти швидко.';
  content.icon = 'lightning'; // editor ignores this; export must not draw it
  content.hasBackgroundOverride = false;

  // 2b) Numbered LIST slide — the reported bug case (must render 01./02./03.
  //     numbered markers, NOT checkbox squares; vertically centered; hanging
  //     indent on wrapped items).
  const list = createEmptySlide();
  list.slideType = 'slide';
  list.layoutPreset = 'list';
  list.title = 'Що перевірити у експерта';
  list.bulletStyle = 'numbered-padded';
  list.listItems = [
    'Реальні кейси та результати, а не лише гарні слова про досвід',
    'Відгуки клієнтів, яких можна знайти і запитати напряму',
    'Чітка методологія роботи від першого дзвінка до результату',
  ];
  list.hasBackgroundOverride = false;

  // 3) Quote/statement (text lives in body).
  const quote = createEmptySlide();
  quote.slideType = 'slide';
  quote.layoutPreset = 'quote';
  quote.title = '';
  quote.body = 'Найбільший ризик — взагалі нічого не робити';
  quote.backgroundType = 'color';
  quote.hasBackgroundOverride = true;
  quote.backgroundColor = '#1F6F54';
  quote.icon = 'sparkle'; // editor draws none; export must not either

  // 4) CTA / final (goal).
  const cta = createEmptySlide();
  cta.slideType = 'final';
  cta.layoutPreset = 'goal';
  cta.title = 'Готові уникнути цих помилок?';
  cta.ctaAction = 'follow';
  cta.hasBackgroundOverride = false;

  return [cover, content, list, quote, cta];
}

const CTA_WORD: Record<string, string> = {
  follow: 'Підпишись',
  save: 'Збережи',
  share: 'Поділись',
  comment: 'Коментуй',
  link: 'Перейди',
};

async function main() {
  const slides = makeSlides();
  const total = slides.length;

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideType = resolveSlideType(slide, i, total);
    const rv = resolveSlideVisualColors(slide, i, total, palette);
    const preset =
      slide.layoutPreset ?? (slideType === 'final' ? 'goal' : slideType === 'cover' ? null : 'text');

    // ---- Export side: exactly mirrors app/api/carousel/generate-slide ----
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

    // ---- Editor side: render the REAL component to static HTML ----
    // Apply the same auto-resolved colors the editor would hold in state.
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
    console.log(`slide ${i + 1}: ${slideType}/${preset} bg=${rv.backgroundColor} title=${rv.titleColor}`);
  }
  console.log('done →', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
