// Verification harness for task 86d3ezr9d — reproduces the REAL broken shape:
// vibe `refined`, font `inter`, dark background #232C3F, brand light #F0EEE9.
// For each layout (cover / content / quote / bullets / cta) it produces:
//   (a) the REAL export PNG via renderCarouselTemplatePng (the shipped path), and
//   (b) an HTML snapshot of the REAL editor component CarouselSlidePreview.
// A sibling script (shoot-refined.mjs) screenshots the editor HTML in the system
// Chrome and composes editor-vs-export side by side.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveSlideType } from '@/lib/carouselTypes';
import { createEmptySlide } from '@/lib/carouselSlides';
import { getCarouselBrandPalette, resolveSlideVisualColors } from '@/lib/carousel/colorSystem';
import { renderCarouselTemplatePng } from '@/lib/carousel/carouselTemplateRender';
import CarouselSlidePreview from '@/components/carousel/CarouselSlidePreview';
import { resolveBrandFont } from '@/lib/brandFonts';

const OUT = join(process.cwd(), '_proofout');
mkdirSync(OUT, { recursive: true });

// Local Inter (latin + cyrillic, 400 + 700) so the editor HTML screenshot
// renders the REAL brand font offline — the export uses these same @fontsource
// files. Family name must equal brandFont.label ('Inter').
const FS = join(process.cwd(), 'node_modules', '@fontsource', 'inter', 'files');
const face = (subset, weight) =>
  `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};font-display:block;src:url('file://${join(FS, `inter-${subset}-${weight}-normal.woff2`).replace(/\\/g, '/')}') format('woff2');}`;
const INTER_FACE = [face('latin', 400), face('cyrillic', 400), face('latin', 700), face('cyrillic', 700)].join('');

// The reported brand: refined vibe, Inter, dark blue #232C3F bg, cream #F0EEE9
// brand light. Accent gold so pills/markers/accent box stay visible on dark.
const brand = {
  theme: 'light',
  vibe: 'refined',
  favColorHex: '#C9A24B',
  colors: { lightBg: '#F0EEE9', darkBg: '#232C3F', accent1: '#C9A24B', accent2: '#5D6B9F' },
  fontId: 'inter',
  accentStyle: 'marker',
};
const brandFont = resolveBrandFont(brand.fontId);
const palette = getCarouselBrandPalette(brand);

const DARK = '#232C3F';
// Force every verification slide onto the dark background so each layout is the
// dark-on-dark legibility test the acceptance criteria demand.
function onDark(slide) {
  slide.backgroundType = 'color';
  slide.hasBackgroundOverride = true;
  slide.backgroundColor = DARK;
  return slide;
}

function makeSlides() {
  const cover = onDark(createEmptySlide());
  cover.slideType = 'cover';
  cover.layoutPreset = null;
  cover.title = 'Як ми втратили 700 клієнтів';
  cover.body = 'Історія однієї дорогої помилки';

  const content = onDark(createEmptySlide());
  content.slideType = 'slide';
  content.layoutPreset = 'text';
  content.optionalLabel = 'Що може піти не так';
  content.title = 'Історія зі втратою 700';
  content.body = 'Коли все йде не за планом, важливо зберігати спокій і діяти швидко.';
  content.icon = 'lightning';

  const list = onDark(createEmptySlide());
  list.slideType = 'slide';
  list.layoutPreset = 'list';
  list.title = 'Що перевірити у експерта';
  list.bulletStyle = 'numbered-padded';
  list.listItems = [
    'Реальні кейси та результати, а не лише гарні слова про досвід',
    'Відгуки клієнтів, яких можна знайти і запитати напряму',
    'Чітка методологія роботи від першого дзвінка до результату',
  ];

  const quote = onDark(createEmptySlide());
  quote.slideType = 'slide';
  quote.layoutPreset = 'quote';
  quote.title = '';
  quote.body = 'Найбільший ризик — взагалі нічого не робити';
  quote.icon = 'sparkle';

  const cta = onDark(createEmptySlide());
  cta.slideType = 'final';
  cta.layoutPreset = 'goal';
  cta.title = 'Готові уникнути цих помилок?';
  cta.ctaAction = 'follow';

  return [cover, content, list, quote, cta];
}

async function main() {
  const slides = makeSlides();
  const total = slides.length;
  const names = ['cover', 'content', 'bullets', 'quote', 'cta'];

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
    writeFileSync(join(OUT, `export-${i + 1}-${names[i]}.png`), png);

    // ---- Editor side: render the REAL component to static HTML ----
    const editorSlide = { ...slide, ...rv, textColorAutoSet: true };
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
<link rel="stylesheet" href="file://${join(OUT, 'tw.css').replace(/\\/g, '/')}">
<style>${INTER_FACE}html,body{margin:0;padding:0}#root{width:1080px;height:1350px}</style>
</head><body><div id="root">${markup}</div></body></html>`;
    writeFileSync(join(OUT, `editor-${i + 1}-${names[i]}.html`), html);
    console.log(`slide ${i + 1} ${names[i]}: ${slideType}/${preset} bg=${rv.backgroundColor} title=${rv.titleColor} body=${rv.bodyColor}`);
  }
  console.log('done →', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
