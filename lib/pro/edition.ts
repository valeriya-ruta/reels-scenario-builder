/**
 * Ruta Pro edition flag. `NEXT_PUBLIC_RUTA_EDITION=pro` is set ONLY on the Pro
 * Vercel project (branch `pro`). The customer deployment (main → web.ruta.media)
 * never sets it, so every Pro-specific affordance stays invisible there.
 *
 * Client-safe: NEXT_PUBLIC_* is inlined at build time, so this constant works in
 * both server and client components.
 */
export const IS_PRO_EDITION = process.env.NEXT_PUBLIC_RUTA_EDITION === 'pro';
