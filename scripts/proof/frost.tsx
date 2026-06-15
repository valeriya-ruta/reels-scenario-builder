// Dev-only proof: photo slide with a frost/backdrop text plate — EDITOR
// (CarouselSlidePreview) vs EXPORT (renderSlideImage legacy photo path).
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import sharp from 'sharp';
import type { Slide } from '@/lib/carouselTypes';
import { resolveSlideType } from '@/lib/carouselTypes';
import { createEmptySlide, slidesForDatabase, normalizeSlidesFromDb } from '@/lib/carouselSlides';
import type { BrandSettings } from '@/lib/brand';
import { resolveBrandFont } from '@/lib/brandFonts';
import { getCarouselBrandPalette, resolveSlideVisualColors } from '@/lib/carousel/colorSystem';
import { renderSlideImagePng } from '@/lib/carousel/renderSlideImage';
import { sanitizeBgPhotoTransform } from '@/lib/carousel/bgPhotoTransform';
import CarouselSlidePreview from '@/components/carousel/CarouselSlidePreview';

const OUT = '/tmp/proof';
mkdirSync(OUT, { recursive: true });
const PHOTO = readFileSync('/tmp/proof/photo.b64', 'utf8').trim();
const FS = join(process.cwd(), 'node_modules', '@fontsource', 'montserrat', 'files');

const brand: BrandSettings = {
  theme: 'light', vibe: 'bold', favColorHex: '#E05C40',
  colors: { lightBg: '#FAF9F7', darkBg: '#141414', accent1: '#E05C40', accent2: '#5D6B9F' },
  fontId: 'montserrat', accentStyle: 'marker',
};
const brandFont = resolveBrandFont(brand.fontId);
const palette = getCarouselBrandPalette(brand);

function photoSlide(overlayType: 'frost' | 'backdrop', withBody: boolean): Slide {
  const s = createEmptySlide();
  s.slideType = 'slide';
  s.layoutPreset = 'text';
  s.title = overlayType === 'frost' ? 'Текст на фото з фрост-плитою' : 'Текст на фото з підкладкою';
  if (withBody) s.body = 'Підкладка тримає текст читабельним поверх фото.';
  s.backgroundType = 'image';
  s.backgroundImageBase64 = PHOTO;
  s.overlayType = overlayType;
  s.overlayColor = '#141414';
  s.overlayOpacity = 55;
  s.placement = 'center';
  return s;
}

async function main() {
  const slides = normalizeSlidesFromDb(slidesForDatabase([
    photoSlide('frost', false),
    photoSlide('backdrop', true),
  ]));

  const face = (sub: string, w: number) =>
    `@font-face{font-family:'Montserrat';font-weight:${w};font-display:block;src:url('file://${join(FS, `montserrat-${sub}-${w}-normal.woff2`)}') format('woff2');}`;

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideType = resolveSlideType(slide, i, slides.length);
    const rv = resolveSlideVisualColors(slide, i, slides.length, palette);
    const png = await renderSlideImagePng({
      title: slide.title ?? '', body: slide.body ?? '', placement: slide.placement ?? 'center',
      text_align: slide.textAlign ?? 'left', title_px: 72, body_px: 38, label: null,
      background_type: 'image', background_color: rv.backgroundColor,
      gradient_mid_color: null, gradient_end_color: null,
      background_image_url: null, background_image_base64: slide.backgroundImageBase64 ?? null,
      title_color: rv.titleColor, body_color: rv.bodyColor, slide_index: i + 1, total_slides: slides.length,
      accent_color: brand.colors.accent1, accent_style: brand.accentStyle, font_id: brand.fontId,
      bg_photo_transform: sanitizeBgPhotoTransform(slide.bgPhotoTransform) ?? null,
      overlay_type: slide.overlayType ?? null, overlay_color: slide.overlayColor ?? '#141414',
      overlay_opacity: typeof slide.overlayOpacity === 'number' ? slide.overlayOpacity : 50,
    });
    writeFileSync(join(OUT, `frost-export-${i + 1}.png`), png);

    const editorSlide: Slide = { ...slide, ...rv, textColorAutoSet: true };
    const markup = renderToStaticMarkup(React.createElement(CarouselSlidePreview, {
      slide: editorSlide, brand, brandFont, scale: 1, slideIndex: i + 1, totalSlides: slides.length,
    }));
    const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///tmp/proof/tw.css">
<style>${['latin', 'cyrillic'].flatMap((s) => [face(s, 400), face(s, 700)]).join('')}html,body{margin:0;padding:0}#root{width:1080px;height:1350px}</style>
</head><body><div id="root">${markup}</div></body></html>`;
    writeFileSync(join(OUT, `frost-editor-${i + 1}.html`), html);
  }

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  const label = (t: string) => Buffer.from(`<svg width="1080" height="56"><rect width="1080" height="56" fill="#111"/><text x="540" y="38" font-family="sans-serif" font-size="28" fill="#fff" text-anchor="middle">${t}</text></svg>`);
  const labeled = async (src: string, t: string) =>
    sharp({ create: { width: 1080, height: 1406, channels: 3, background: '#111' } })
      .composite([{ input: label(t), top: 0, left: 0 }, { input: await sharp(src).resize(1080, 1350).png().toBuffer(), top: 56, left: 0 }]).png().toBuffer();

  for (let i = 1; i <= slides.length; i++) {
    await page.goto('file://' + join(OUT, `frost-editor-${i}.html`));
    await page.waitForTimeout(800);
    await (await page.$('#root > *') ?? page).screenshot({ path: join(OUT, `frost-editor-${i}.png`) });
    const eL = await labeled(join(OUT, `frost-editor-${i}.png`), 'EDITOR');
    const xL = await labeled(join(OUT, `frost-export-${i}.png`), 'EXPORT');
    await sharp({ create: { width: 2176, height: 1406, channels: 3, background: '#333' } })
      .composite([{ input: eL, top: 0, left: 0 }, { input: xL, top: 0, left: 1096 }]).png().toFile(join(OUT, `frost-compare-${i}.png`));
    console.log('frost-compare-' + i + '.png');
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
