import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    root: path.join(__dirname),
  },
  devIndicators: false,
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
