import { test, expect } from '@playwright/test';
import { createEmptySlide, normalizeSlidesFromDb, slidesForDatabase } from '@/lib/carouselSlides';

/**
 * Data-integrity coverage for the carousel export/autosave rebuild.
 *
 * These are pure-logic assertions over the single source of truth used by BOTH
 * the editor and the server-side export, so they verify the fixes that are
 * otherwise only observable on the deployed build:
 *  - 86d36eg7t: a photo-typed slide with no actual photo must be coerced back to
 *    `color` (otherwise the cover renderer fills black) on both load and save.
 *  - 86d36eg0h / 86d39dw6b: slidesForDatabase strips heavy generated previews so
 *    the persisted model the export reads is the same one the editor holds.
 */

test.describe('carousel slide persistence (single source of truth)', () => {
  test('coerces a photo-typed slide with no photo back to color on load', () => {
    const [slide] = normalizeSlidesFromDb([
      {
        ...createEmptySlide(),
        backgroundType: 'image',
        backgroundImageUrl: null,
        backgroundImageBase64: null,
        overlayType: 'frost',
        backgroundColor: '#6E1A2E',
      },
    ]);
    expect(slide.backgroundType).toBe('color');
    expect(slide.overlayType).toBeNull();
    // The chosen color must survive so it doesn't fall back to a dark/black fill.
    expect(slide.backgroundColor).toBe('#6E1A2E');
  });

  test('keeps a photo slide that has an actual image', () => {
    const [slide] = normalizeSlidesFromDb([
      {
        ...createEmptySlide(),
        backgroundType: 'image',
        backgroundImageBase64: 'AAAA',
        overlayType: 'full',
      },
    ]);
    expect(slide.backgroundType).toBe('image');
    expect(slide.overlayType).toBe('full');
  });

  test('slidesForDatabase strips generated previews and coerces empty photo slides', () => {
    const dirty = [
      { ...createEmptySlide(), generatedImageBase64: 'HUGE_BASE64', backgroundType: 'color' as const },
      {
        ...createEmptySlide(),
        backgroundType: 'image' as const,
        backgroundImageUrl: null,
        backgroundImageBase64: null,
        overlayType: 'backdrop' as const,
      },
    ];
    const persisted = slidesForDatabase(dirty);
    expect(persisted[0].generatedImageBase64).toBeNull();
    expect(persisted[1].backgroundType).toBe('color');
    expect(persisted[1].overlayType).toBeNull();
  });

  test('round-trips a color slide unchanged', () => {
    const original = { ...createEmptySlide(), backgroundType: 'color' as const, backgroundColor: '#1F3A6E' };
    const [restored] = normalizeSlidesFromDb(slidesForDatabase([original]));
    expect(restored.backgroundType).toBe('color');
    expect(restored.backgroundColor).toBe('#1F3A6E');
  });
});
