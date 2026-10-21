import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf",
      "./node_modules/dejavu-fonts-ttf/LICENSE",
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
