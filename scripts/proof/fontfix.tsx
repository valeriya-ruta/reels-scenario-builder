// Dev-only proof for the two export font fixes on a CORMORANT brand:
//  (1) refined cover serif title at line-height 1.0 (86d3cpv1m)
//  (2) bold CTA accent-box body in BODY sans (Inter), not the Cormorant title
//      face (86d3cpv57)
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { renderCarouselTemplatePng } from '@/lib/carousel/carouselTemplateRender';
import { getCarouselBrandPalette } from '@/lib/carousel/colorSystem';
import type { BrandSettings } from '@/lib/brand';

const OUT = '/tmp/proof';
mkdirSync(OUT, { recursive: true });

function brand(vibe: 'bold' | 'refined'): BrandSettings {
  return {
    theme: 'light', vibe, favColorHex: '#1F6F54',
    colors: { lightBg: '#FAF9F7', darkBg: '#141414', accent1: '#1F6F54', accent2: '#5D6B9F' },
    fontId: 'cormorant', accentStyle: 'marker',
  };
}

async function render(vibe: 'bold' | 'refined', slideType: 'cover' | 'final', layoutPreset: 'goal' | null, title: string, body: string) {
  const b = brand(vibe);
  const palette = getCarouselBrandPalette(b);
  return renderCarouselTemplatePng({
    slideType, layoutPreset, title, body, textAlign: 'left', placement: 'center',
    label: null, items: null, icon: null, bulletStyle: null, testimonialAuthor: null,
    ctaAction: null, ctaTitle: null, ctaKeyword: null, titleSize: 'L', bodySize: 'M',
    backgroundType: 'color', backgroundColor: vibe === 'refined' ? '#FAF9F7' : '#1F6F54',
    titleColor: vibe === 'refined' ? '#1a1a1a' : '#FAF9F7', bodyColor: '#FAF9F7',
    designNote: null, slideIndex: 1, totalSlides: 3, palette,
    brand: { vibe, primaryColor: b.colors.lightBg, accentColor: b.colors.accent1, accentStyle: b.accentStyle, fontPairing: b.fontId },
    handle: '', domain: '',
  });
}

async function main() {
  const cover = await render('refined', 'cover', null, 'Як перетворити одну ідею на місяць контенту', '');
  writeFileSync(join(OUT, 'fontfix-cover.png'), cover);
  const cta = await render('bold', 'final', 'goal', 'Готові почати?', 'Підпишись, щоб не пропустити');
  writeFileSync(join(OUT, 'fontfix-cta.png'), cta);
  console.log('wrote fontfix-cover.png + fontfix-cta.png');
}
main().catch((e) => { console.error(e); process.exit(1); });
