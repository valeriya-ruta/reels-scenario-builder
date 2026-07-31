// Round 3 §5: is the slide-strip thumbnail actually rectangular?
// Renders the REAL CarouselSlidePreview at strip scale, at both sizes, so the
// shape can be judged from a screenshot instead of from the CSS.
//
//   PROOF_DIR=_proofout_r3 node scripts/proof/tw-refined.mjs
//   node --import ./scripts/proof/_register.mjs ./scripts/proof/r3-thumbs.tsx
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';

import CarouselSlidePreview from '@/components/carousel/CarouselSlidePreview';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/carousel/carouselConstants';
import type { Slide } from '@/lib/carouselTypes';
import type { BrandSettings } from '@/lib/brand';
import { resolveBrandFont } from '@/lib/brandFonts';

const OUT = join(process.cwd(), '_proofout_r3');
mkdirSync(OUT, { recursive: true });
const CHROME =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const brand: BrandSettings = {
  theme: 'dark',
  vibe: 'refined',
  favColorHex: '#C9A227',
  colors: { lightBg: '#F0EEE9', darkBg: '#232C3F', accent1: '#C9A227', accent2: '#8FA5C4' },
  fontId: 'inter',
  accentStyle: 'marker',
};
const brandFont = resolveBrandFont('inter');

function slide(over: Partial<Slide>): Slide {
  return {
    id: over.id ?? 's',
    title: 'Як ми втратили 700 клієнтів',
    body: 'Історія однієї дорогої помилки',
    placement: 'bottom',
    textAlign: 'center',
    backgroundType: 'color',
    backgroundColor: '#232C3F',
    backgroundImageUrl: null,
    backgroundImageBase64: null,
    titleColor: '#F0EEE9',
    bodyColor: '#F0EEE9',
    generatedImageBase64: null,
    overlayType: null,
    overlayColor: '#000000',
    overlayOpacity: 0,
    slideType: 'cover',
    ...over,
  } as Slide;
}

const slides: Slide[] = [
  slide({ id: '1' }),
  slide({ id: '2', slideType: 'slide', layoutPreset: 'text', title: 'Що перевірити', body: 'Реальні кейси та результати' }),
  slide({ id: '3', slideType: 'final', layoutPreset: 'goal', title: 'Готові уникнути?', body: 'Підпишись' }),
];

/** Exactly the geometry SortableThumb uses. */
function Thumb({ s, index, size, active }: { s: Slide; index: number; size: 'sm' | 'md'; active: boolean }) {
  const thumbHeight = size === 'sm' ? 58 : 78;
  const thumbWidth = Math.round((thumbHeight * CANVAS_WIDTH) / CANVAS_HEIGHT);
  const thumbScale = Math.min(thumbWidth / CANVAS_WIDTH, thumbHeight / CANVAS_HEIGHT);
  return React.createElement(
    'div',
    {
      style: { width: thumbWidth, height: thumbHeight },
      className: `relative shrink-0 overflow-hidden rounded-[5px] ${active ? 'ring-2' : 'ring-1 ring-black/10'}`,
    },
    React.createElement(
      'span',
      { className: 'absolute inset-0 overflow-hidden rounded-[5px]' },
      React.createElement(CarouselSlidePreview, {
        slide: s,
        brand,
        brandFont,
        scale: thumbScale,
        slideIndex: index + 1,
        totalSlides: slides.length,
      }),
    ),
    React.createElement('span', {
      className: 'pointer-events-none absolute inset-0',
      style: { borderRadius: 5, border: active ? '2px solid #C9A227' : '1px solid rgba(0,0,0,0.08)' },
    }),
  );
}

const sheet = React.createElement(
  'div',
  { style: { padding: 20, background: '#fff' } },
  React.createElement('p', { style: { fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: '#888', margin: '0 0 8px' } }, 'STRIP sm (58px)'),
  React.createElement(
    'div',
    { className: 'flex flex-row items-center gap-2 overflow-x-auto', style: { marginBottom: 24 } },
    ...slides.map((s, i) => React.createElement(Thumb, { key: `sm${s.id}`, s, index: i, size: 'sm', active: i === 0 })),
  ),
  React.createElement('p', { style: { fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: '#888', margin: '0 0 8px' } }, 'STRIP md (78px)'),
  React.createElement(
    'div',
    { className: 'flex flex-row items-center gap-2 overflow-x-auto' },
    ...slides.map((s, i) => React.createElement(Thumb, { key: `md${s.id}`, s, index: i, size: 'md', active: i === 0 })),
  ),
);

const globals = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');
const rootTokens = globals.slice(globals.indexOf(':root'), globals.indexOf('@keyframes'));
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${join(OUT, 'tw.css').replace(/\\/g, '/')}">
<style>${rootTokens}
html,body{margin:0;padding:0;font-family:ui-sans-serif,system-ui,sans-serif}
#root{width:520px}</style></head><body><div id="root">${renderToStaticMarkup(sheet)}</div></body></html>`;
writeFileSync(join(OUT, 'thumbs.html'), html);

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 520, height: 420 }, deviceScaleFactor: 3 });
await page.goto('file://' + join(OUT, 'thumbs.html').replace(/\\/g, '/'));
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, 'thumbs.png'), fullPage: true });
await browser.close();
console.log('wrote', join(OUT, 'thumbs.png'));
