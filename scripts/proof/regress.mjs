// Regression check: renders the BOLD-vibe export PNGs (the path this task must
// NOT change) for every layout and prints a sha256 per slide. Run on the branch
// and on main; identical hashes prove no non-refined regression.
import { createHash } from 'node:crypto';
import { resolveSlideType } from '@/lib/carouselTypes';
import { createEmptySlide } from '@/lib/carouselSlides';
import { getCarouselBrandPalette, resolveSlideVisualColors } from '@/lib/carousel/colorSystem';
import { renderCarouselTemplatePng } from '@/lib/carousel/carouselTemplateRender';

const brand = {
  theme: 'light',
  vibe: 'bold',
  favColorHex: '#E05C40',
  colors: { lightBg: '#FAF9F7', darkBg: '#141414', accent1: '#E05C40', accent2: '#5D6B9F' },
  fontId: 'montserrat',
  accentStyle: 'marker',
};
const palette = getCarouselBrandPalette(brand);

function makeSlides() {
  const cover = createEmptySlide();
  cover.slideType = 'cover';
  cover.layoutPreset = null;
  cover.title = 'Як ми втратили 700 клієнтів';
  cover.body = 'Історія однієї дорогої помилки';

  const content = createEmptySlide();
  content.slideType = 'slide';
  content.layoutPreset = 'text';
  content.optionalLabel = 'Що може піти не так';
  content.title = 'Історія зі втратою 700';
  content.body = 'Коли все йде не за планом, важливо зберігати спокій і діяти швидко.';

  const list = createEmptySlide();
  list.slideType = 'slide';
  list.layoutPreset = 'list';
  list.title = 'Що перевірити у експерта';
  list.bulletStyle = 'numbered-padded';
  list.listItems = ['Реальні кейси та результати', 'Відгуки клієнтів', 'Чітка методологія роботи'];

  const quote = createEmptySlide();
  quote.slideType = 'slide';
  quote.layoutPreset = 'quote';
  quote.body = 'Найбільший ризик — взагалі нічого не робити';
  quote.backgroundType = 'color';
  quote.hasBackgroundOverride = true;
  quote.backgroundColor = '#1F6F54';

  const cta = createEmptySlide();
  cta.slideType = 'final';
  cta.layoutPreset = 'goal';
  cta.title = 'Готові уникнути цих помилок?';
  cta.ctaAction = 'follow';

  return [cover, content, list, quote, cta];
}

const names = ['cover', 'content', 'bullets', 'quote', 'cta'];
const slides = makeSlides();
const total = slides.length;
for (let i = 0; i < slides.length; i++) {
  const slide = slides[i];
  const slideType = resolveSlideType(slide, i, total);
  const rv = resolveSlideVisualColors(slide, i, total, palette);
  const preset = slide.layoutPreset ?? (slideType === 'final' ? 'goal' : slideType === 'cover' ? null : 'text');
  const png = await renderCarouselTemplatePng({
    slideType, layoutPreset: preset,
    title: slide.title ?? '', body: slide.body ?? '',
    textAlign: slide.textAlign ?? 'left', placement: slide.placement ?? 'center',
    label: slide.optionalLabel ?? null, items: slide.listItems ?? slide.items ?? null,
    icon: slide.icon ?? null, bulletStyle: slide.bulletStyle ?? null,
    testimonialAuthor: slide.testimonialAuthor ?? null, ctaAction: slide.ctaAction ?? null,
    ctaTitle: slide.ctaTitle ?? null, ctaKeyword: slide.ctaKeyword ?? null,
    titleSize: slide.titleSize ?? 'L', bodySize: slide.bodySize ?? 'M',
    backgroundType: slide.backgroundType ?? 'color', backgroundColor: rv.backgroundColor,
    gradientMidColor: slide.gradientMidColor ?? undefined, gradientEndColor: slide.gradientEndColor ?? undefined,
    titleColor: rv.titleColor, bodyColor: rv.bodyColor, designNote: slide.design_note ?? null,
    slideIndex: i + 1, totalSlides: total, palette,
    brand: { vibe: brand.vibe, primaryColor: brand.colors.lightBg, accentColor: brand.colors.accent1, accentStyle: brand.accentStyle, fontPairing: brand.fontId },
    handle: '@ruta.media', domain: 'web.ruta.media',
  });
  console.log(`${names[i]}\t${createHash('sha256').update(png).digest('hex')}`);
}
