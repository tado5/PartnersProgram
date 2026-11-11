import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-store, max-age=0" },
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
  // Keep the dev badge away from the sidebar footer (logout button).
  devIndicators: { position: "bottom-right" },
  // pdfkit reads its data files from disk; the report PDF embeds DejaVu fonts (Slovak diacritics).
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/reports/pdf": [
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf",
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf",
      "./node_modules/dejavu-fonts-ttf/LICENSE",
    ],
    "/api/partners/*/card": [
      "./src/assets/fonts/DejaVuSans.ttf",
      "./src/assets/fonts/DejaVuSans-Bold.ttf",
      "./src/assets/fonts/LICENSE",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
