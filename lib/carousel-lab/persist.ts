// Serialize/normalize LabSlide[] for the carousel_lab_projects.slides JSONB column.
// Defensive on read so an older/partial row never crashes the editor (round-trip safe).

import type {
  LabSlide,
  LabSlideType,
  LabSubtype,
  LabPicturePosition,
  LabVariant,
  LabImage,
  LabPointSide,
} from './types';
import { createSlide } from './defaults';

const TYPES: LabSlideType[] = ['cover', 'text', 'numbers', 'cta', 'testimonial'];
const POSITIONS: LabPicturePosition[] = ['none', 'up', 'down', 'middle'];

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}
function normImage(v: unknown): LabImage {
  const o = (v ?? {}) as Record<string, unknown>;
  const tRaw = (o.transform ?? null) as Record<string, unknown> | null;
  const transform =
    tRaw && typeof tRaw === 'object'
      ? {
          tx: typeof tRaw.tx === 'number' ? tRaw.tx : 0,
          ty: typeof tRaw.ty === 'number' ? tRaw.ty : 0,
          scale: typeof tRaw.scale === 'number' ? tRaw.scale : 1,
        }
      : null;
  return {
    storagePath: typeof o.storagePath === 'string' ? o.storagePath : null,
    url: typeof o.url === 'string' ? o.url : null,
    base64: typeof o.base64 === 'string' ? o.base64 : null,
    aspect: typeof o.aspect === 'number' ? o.aspect : null,
    transform,
  };
}
function normImages(v: unknown): LabImage[] {
  return Array.isArray(v) ? v.map(normImage) : [];
}
function normPoints(v: unknown): LabPointSide[] {
  const arr = Array.isArray(v) ? v : [];
  const out = arr.slice(0, 2).map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return { label: str(o.label), text: str(o.text) };
  });
  while (out.length < 2) out.push({ label: out.length === 0 ? 'Точка А:' : 'Точка Б:', text: '' });
  return out;
}

export function normalizeSlide(raw: unknown): LabSlide {
  const o = (raw ?? {}) as Record<string, unknown>;
  const type = (TYPES.includes(o.type as LabSlideType) ? o.type : 'text') as LabSlideType;
  const base = createSlide(type, (str(o.subtype) || 'paragraph') as LabSubtype);
  return {
    ...base,
    id: str(o.id, base.id),
    type,
    subtype: (str(o.subtype) || base.subtype) as LabSubtype,
    picturePosition: (POSITIONS.includes(o.picturePosition as LabPicturePosition)
      ? o.picturePosition
      : 'none') as LabPicturePosition,
    variant: (str(o.variant) || base.variant) as LabVariant,
    title: str(o.title),
    body: str(o.body),
    bodyAfter: str(o.bodyAfter),
    bullets: strArr(o.bullets),
    statValue: str(o.statValue),
    ctaKeyword: str(o.ctaKeyword),
    points: normPoints(o.points),
    images: normImages(o.images),
  };
}

export function normalizeSlidesFromDb(raw: unknown): LabSlide[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeSlide);
}

/** Strip nothing but ensure a plain JSON-serializable array for the DB. */
export function slidesForDb(slides: LabSlide[]): unknown[] {
  return slides.map((s) => ({
    id: s.id,
    type: s.type,
    subtype: s.subtype,
    picturePosition: s.picturePosition,
    variant: s.variant,
    title: s.title,
    body: s.body,
    bodyAfter: s.bodyAfter,
    bullets: s.bullets,
    statValue: s.statValue,
    ctaKeyword: s.ctaKeyword,
    points: s.points,
    images: s.images.map((i) => ({
      storagePath: i.storagePath ?? null,
      url: i.url ?? null,
      base64: i.base64 ?? null,
      aspect: i.aspect ?? null,
      transform: i.transform ?? null,
    })),
  }));
}
