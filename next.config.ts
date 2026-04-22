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
    "@ffmpeg-installer/ffmpeg",
    "fluent-ffmpeg",
  ],
};

export default nextConfig;
