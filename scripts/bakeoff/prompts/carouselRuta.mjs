/**
 * Refined "Ruta method" carousel prompt for the bake-off.
 *
 * This is now the PRODUCTION prompt — it was promoted into the app at
 * `lib/ai/carouselPrompt.ts`. This file re-exports it so the bake-off always
 * tests exactly what ships (single source of truth, zero drift). The
 * pre-bake-off baseline lives in `carouselBaseline.mjs`.
 */

export { buildSystemPrompt, detectOutputLanguage } from '@/lib/ai/carouselPrompt';
