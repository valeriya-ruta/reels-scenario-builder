import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    root: path.join(__dirname),
  },
  devIndicators: false,
  experimental: {
    // Carousel slides can carry a base64 background photo. The default 1 MB
    // Server Action body limit made BOTH autosave and the export pre-save throw
    // "Body exceeded 1 MB limit" — the real exception behind the silent autosave
    // data loss (86d36eg0h) and the "Не вдалося згенерувати слайди" export
    // failure (86d39dw6b). Slide persistence now goes through the
    // /api/carousel/save route handler, but raise this so any remaining Server
    // Action (e.g. project-name save) never trips the limit either.
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  serverExternalPackages: [
    "sharp",
    "@napi-rs/canvas",
  ],
  // The carousel export registers brand fonts into @napi-rs/canvas by reading
  // @fontsource (woff2/woff) and bundled Noto files from disk at runtime via
  // dynamically-built paths. Next.js dependency tracing cannot see those string
  // paths, so without this they would NOT ship to the Vercel serverless function
  // and every export would silently fall back to NotoSans. Force-include them.
  outputFileTracingIncludes: {
    "/api/carousel/generate-slide": [
      "./node_modules/@fontsource/*/files/*.woff2",
      "./node_modules/@fontsource/*/files/*.woff",
      "./public/fonts/*.ttf",
    ],
  },
};

export default nextConfig;
