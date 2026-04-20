import type { CarouselRantOutput, CarouselRantSlide, SlideKind } from '@/lib/carouselTypes';

const ALLOWED_TYPES = new Set<SlideKind>([
  'cover',
  'content',
  'statement',
  'bullets',
  'cta',
]);

const ALLOWED_ICONS = new Set([
  'image',
  'lightning',
  'star',
  'check',
  'arrow-right',
  'clock',
  'calendar',
  'fire',
  'sparkle',
  'target',
  'camera',
  'pen',
  'chart',
  'heart',
  'globe',
]);

function coerceSlide(row: unknown, index: number): CarouselRantSlide {
  const o = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
  const typeRaw = o.type;
  const type =
    typeof typeRaw === 'string' && ALLOWED_TYPES.has(typeRaw as SlideKind)
      ? (typeRaw as SlideKind)
      : undefined;
  const iconRaw = o.icon;
  const icon =
    typeof iconRaw === 'string' && ALLOWED_ICONS.has(iconRaw) ? iconRaw : null;
  const items = Array.isArray(o.items)
    ? (o.items as unknown[]).filter((x): x is string => typeof x === 'string')
    : null;

  return {
    slide_number: typeof o.slide_number === 'number' ? o.slide_number : index + 1,
    type,
    title: o.title === null || typeof o.title === 'string' ? (o.title as string | null) : null,
    body: o.body === null || typeof o.body === 'string' ? (o.body as string | null) : null,
    label: o.label === null || typeof o.label === 'string' ? (o.label as string | null) : null,
    items,
    icon,
    accent_spans: o.accent_spans,
    layout: o.layout === 'text_only' || o.layout === 'title_and_text' ? o.layout : undefined,
    design_note:
      o.design_note === null || typeof o.design_note === 'string'
        ? (o.design_note as string | null)
        : null,
  };
}

/**
 * Normalizes model output: valid types/icons, first= cover, last=cta, no adjacent `statement`.
 */
export function postProcessCarouselRant(data: unknown): CarouselRantOutput {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const rawSlides = Array.isArray(root.slides) ? root.slides : [];
  let slides = rawSlides.map((row, i) => coerceSlide(row, i));

  if (slides.length === 0) {
    return { total_slides: 0, slides: [] };
  }

  slides = slides.map((s, i) => {
    let type: SlideKind | undefined = s.type;
    if (!type) {
      if (i === 0) type = 'cover';
      else if (i === slides.length - 1) type = 'cta';
      else type = 'content';
    }
    return { ...s, type };
  });

  slides[0] = { ...slides[0], type: 'cover' };
  slides[slides.length - 1] = { ...slides[slides.length - 1], type: 'cta' };

  for (let i = 1; i < slides.length; i++) {
    if (slides[i].type === 'statement' && slides[i - 1].type === 'statement') {
      slides[i] = { ...slides[i], type: 'content' };
    }
  }

  const statementCount = slides.filter((s) => s.type === 'statement').length;
  if (statementCount > 2) {
    let seen = 0;
    slides = slides.map((s) => {
      if (s.type !== 'statement') return s;
      seen++;
      if (seen > 2) return { ...s, type: 'content' as SlideKind };
      return s;
    });
  }

  return {
    total_slides: slides.length,
    slides,
  };
}
