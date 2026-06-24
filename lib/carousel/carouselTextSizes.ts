/**
 * Shared text-size source of truth for the carousel BODY role — body
 * paragraphs, cover sublines and numbered-list items — read by BOTH the editor
 * preview (`components/carousel/CarouselSlidePreview.tsx`) and the export
 * renderer (`lib/carousel/carouselTemplateRender.ts`), so the two can never
 * drift in size (task 86d3f1qqm).
 *
 * Background: task 86d36ej91 added a `TEXT_SCALE = 1.11` bump but applied it
 * EXPORT-ONLY and to EVERY text role. That broke WYSIWYG (editor body 1.0 vs
 * export 1.11) and shifted line wrapping. The fix keeps the ~1.11 magnitude
 * ONLY for the body role and promotes it to this shared value, while title +
 * CTA render unscaled (1:1) in both surfaces.
 */
export const BODY_TEXT_SCALE = 1.11;

/**
 * Scale a body-role font size (px) by the shared body bump. Title, CTA, pills,
 * markers and eyebrows are intentionally NOT passed through here — they render
 * at their unscaled px in both surfaces.
 */
export function scaleBodyPx(px: number): number {
  return Math.round(px * BODY_TEXT_SCALE);
}
