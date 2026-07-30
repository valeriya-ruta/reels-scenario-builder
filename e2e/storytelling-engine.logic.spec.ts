import { test, expect } from '@playwright/test';
import { normalizeOutput, type StoriesOutput } from '../lib/ai/storiesNormalize';

/**
 * Core-logic spec for the storytelling master engine (task 86d3gp8tb).
 *
 * The generation itself is a live Groq call (non-deterministic, needs
 * credentials), so the acceptance-relevant *deterministic* contract is the
 * normalization that maps the model's JSON into the app's day/column model:
 *   • single  → exactly one day (→ one column)
 *   • saga    → one day per день (→ one column each; reuses existing multi-column board)
 *   • the hard CTA (Заклик в директ) lands ONLY on the final slide of the final day
 *   • honest *placeholders* in screen_text are preserved verbatim (never invented over)
 *   • each day gets a talking-head hook slide + an early sticker
 *
 * This runs as pure logic (no page/server), so it is green with zero config.
 */

function slide(overrides: Record<string, unknown> = {}) {
  return {
    slide_number: 1,
    one_thought: 'думка',
    screen_text: 'текст',
    visual: 'Кольоровий фон',
    interactive: null,
    ...overrides,
  };
}

test.describe('storytelling engine — normalizeOutput', () => {
  test('single braindump → one day, one CTA on the last slide, placeholders kept', () => {
    const raw = {
      mode: 'single',
      reason: 'Одна думка — одна історія.',
      cases_variant: null,
      template_used: 'D',
      template_name: 'Літній офіс',
      days: [
        {
          day_number: 1,
          title: 'Літній офіс',
          slides: [
            slide({ screen_text: 'Давно не показувала свій літній офіс', visual: 'Кольоровий фон' }),
            slide({ screen_text: 'І тут я зрозуміла *тут реальна цифра скільки заробляю*' }),
            slide({ screen_text: 'змінилась не кількість — змінилась ЯКІСТЬ' }),
            slide({ screen_text: 'Напиши в директ', visual: 'Гарне фото', interactive: null }),
          ],
        },
      ],
    };

    const out: StoriesOutput = normalizeOutput(raw);

    expect(out.mode).toBe('single');
    expect(out.days).toHaveLength(1);

    // Hook slide forced to a talking-head-friendly visual (not a flat colour bg).
    expect(['Говоряча голова', 'Відео в тему']).toContain(out.days[0].slides[0].visual);

    // Exactly one hard CTA, and it is the final slide.
    const ctas = out.slides.filter((s) => s.interactive === 'Заклик в директ');
    expect(ctas).toHaveLength(1);
    expect(out.slides[out.slides.length - 1].interactive).toBe('Заклик в директ');

    // The honest placeholder must survive untouched — never fabricated over.
    expect(out.slides.some((s) => s.screen_text.includes('*тут реальна цифра скільки заробляю*'))).toBe(true);

    // Flat slides renumbered 1..N contiguously.
    expect(out.slides.map((s) => s.slide_number)).toEqual(out.slides.map((_, i) => i + 1));
  });

  test('saga braindump → one column per day, CTA only on the final day/slide', () => {
    const day = (n: number, extra: Record<string, unknown> = {}) => ({
      day_number: n,
      title: `День ${n}`,
      slides: [
        slide({ screen_text: `день ${n} хук`, visual: 'Говоряча голова' }),
        slide({ screen_text: `день ${n} контекст` }),
        slide({ screen_text: `день ${n} розвʼязка`, ...extra }),
      ],
    });

    const raw = {
      mode: 'saga',
      reason: 'Тут забагато для однієї сторітел — зробила сагу на 4 дні.',
      cases_variant: 'A',
      template_used: 'B',
      template_name: 'Запуск наставництва',
      // Deliberately give an earlier day a stray CTA to prove it is stripped.
      days: [day(1, { interactive: 'Заклик в директ' }), day(2), day(3), day(4)],
    };

    const out = normalizeOutput(raw);

    expect(out.mode).toBe('saga');
    expect(out.days).toHaveLength(4);
    expect(out.cases_variant).toBe('A');

    // Exactly one hard CTA across the whole saga, on the very last slide.
    const ctas = out.slides.filter((s) => s.interactive === 'Заклик в директ');
    expect(ctas).toHaveLength(1);
    expect(out.slides[out.slides.length - 1].interactive).toBe('Заклик в директ');

    // Each day keeps its own slides (so each becomes its own column).
    for (const d of out.days) {
      expect(d.slides.length).toBeGreaterThanOrEqual(3);
      expect(['Говоряча голова', 'Відео в тему']).toContain(d.slides[0].visual);
    }
  });

  test('malformed / empty payload still yields a usable single story', () => {
    const out = normalizeOutput({});
    expect(out.mode).toBe('single');
    expect(out.days).toHaveLength(1);
    expect(out.days[0].slides.length).toBeGreaterThanOrEqual(3);
    expect(out.slides[out.slides.length - 1].interactive).toBe('Заклик в директ');
  });
});
