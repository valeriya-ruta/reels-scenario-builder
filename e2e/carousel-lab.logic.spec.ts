import { test, expect } from '@playwright/test';
import { createSlide, SAMPLE_SLIDES } from '@/lib/carousel-lab/defaults';
import { normalizeSlidesFromDb, slidesForDb, normalizeSlide } from '@/lib/carousel-lab/persist';

/**
 * Persistence round-trip for the Carousel Lab v2 engine (single source of truth
 * for editor + export). Mirrors the existing carousel-persistence logic spec:
 * proves that create → serialize (save) → normalize (reload) restores an
 * identical slide model for EVERY type/subtype/variant/picture-position.
 */
test.describe('carousel-lab slide persistence (new table model)', () => {
  test('every sample slide round-trips byte-identical through the DB shape', () => {
    const original = SAMPLE_SLIDES.map((s) => s.slide);
    const restored = normalizeSlidesFromDb(slidesForDb(original));
    expect(restored).toHaveLength(original.length);
    restored.forEach((r, i) => {
      // normalizeSlide fills defaults; compare the fields we persist.
      const o = normalizeSlide(original[i]);
      expect(r).toEqual(o);
    });
  });

  test('type/subtype/variant/picturePosition survive the round-trip', () => {
    const s = createSlide('text', 'numbered', { picturePosition: 'up', variant: 'default' });
    s.title = 'ЗАГОЛОВОК';
    s.bullets = ['A', 'B', 'C'];
    const [r] = normalizeSlidesFromDb(slidesForDb([s]));
    expect(r.type).toBe('text');
    expect(r.subtype).toBe('numbered');
    expect(r.picturePosition).toBe('up');
    expect(r.bullets).toEqual(['A', 'B', 'C']);
  });

  test('point A→Б sides and image slots persist', () => {
    const s = createSlide('testimonial', 'point_ab', { variant: 'diagonal' });
    s.points = [
      { label: 'Точка А:', text: 'було' },
      { label: 'Точка Б:', text: 'стало' },
    ];
    s.images = [{ storagePath: 'u/p/a.jpg', url: 'https://x/a.jpg', base64: null, aspect: 0.8 }, {}];
    const [r] = normalizeSlidesFromDb(slidesForDb([s]));
    expect(r.points[0]).toEqual({ label: 'Точка А:', text: 'було' });
    expect(r.points[1]).toEqual({ label: 'Точка Б:', text: 'стало' });
    expect(r.images[0].storagePath).toBe('u/p/a.jpg');
    expect(r.images[0].url).toBe('https://x/a.jpg');
  });

  test('malformed/partial DB rows normalize without throwing', () => {
    const rows = [null, {}, { type: 'nonsense' }, { type: 'cover', title: 42 }];
    const restored = normalizeSlidesFromDb(rows);
    expect(restored).toHaveLength(4);
    expect(restored[3].type).toBe('cover');
    expect(typeof restored[3].title).toBe('string');
  });
});
