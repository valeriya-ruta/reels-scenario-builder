// Proof for task 86d38z46t: the font-pairing preview is a TRUE 1:1 carousel
// render (CarouselSlidePreview), shown compact. For each pairing we render the
// COMPACT preview (what the panel shows, scale 0.24) next to a FULL slide
// (scale 0.5) — identical fonts/sizes/proportions, just scaled.
import { mkdirSync, writeFileSync } from 'fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Slide } from '@/lib/carouselTypes';
import { createEmptySlide } from '@/lib/carouselSlides';
import type { BrandSettings } from '@/lib/brand';
import { resolveBrandFont } from '@/lib/brandFonts';
import CarouselSlidePreview from '@/components/carousel/CarouselSlidePreview';

mkdirSync('/tmp/proof', { recursive: true });

function brandFor(fontId: string): BrandSettings {
  return {
    theme: 'light',
    vibe: 'bold',
    favColorHex: '#E05C40',
    colors: { lightBg: '#FAF9F7', darkBg: '#141414', accent1: '#E05C40', accent2: '#5D6B9F' },
    fontId,
    accentStyle: 'marker',
  };
}

const slide: Slide = (() => {
  const s = createEmptySlide();
  s.slideType = 'slide';
  s.layoutPreset = 'text';
  s.optionalLabel = 'Бренд';
  s.title = 'Твій бренд готовий';
  s.body = 'Так виглядатимуть заголовки й основний текст у твоїх каруселях.';
  s.backgroundType = 'color';
  s.hasBackgroundOverride = false;
  return s;
})();

function preview(fontId: string, scale: number) {
  return renderToStaticMarkup(
    React.createElement(CarouselSlidePreview, {
      slide,
      brand: brandFor(fontId),
      brandFont: resolveBrandFont(fontId),
      scale,
      slideIndex: 2,
      totalSlides: 3,
    }),
  );
}

const pairings = [
  { id: 'montserrat', label: 'Montserrat (title + body)' },
  { id: 'cormorant', label: 'Cormorant (titles-only → body = Inter)' },
];

const rows = pairings
  .map(
    (p) => `
  <div style="margin:18px 0">
    <div style="font:600 18px 'Inter',sans-serif;margin-bottom:8px">${p.label}</div>
    <div style="display:flex;align-items:flex-start;gap:24px">
      <div><div style="font:13px 'Inter',sans-serif;color:#666;margin-bottom:4px">COMPACT preview (panel, scale 0.24)</div>${preview(
        p.id,
        0.24,
      )}</div>
      <div><div style="font:13px 'Inter',sans-serif;color:#666;margin-bottom:4px">FULL slide (real, scale 0.5)</div>${preview(
        p.id,
        0.5,
      )}</div>
    </div>
  </div>`,
  )
  .join('');

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///tmp/proof/tw.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Montserrat:wght@400;700&family=Cormorant+Garamond:wght@400;700&display=swap" rel="stylesheet">
<style>html,body{margin:0;padding:24px;background:#fff}</style>
</head><body><div id="root">${rows}</div></body></html>`;
writeFileSync('/tmp/proof/fp.html', html);
console.log('wrote /tmp/proof/fp.html');
