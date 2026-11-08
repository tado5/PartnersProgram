import type { Metadata, Viewport } from "next";
import { env } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "PartnersProgram | Partnerský program",
  description: "Správa partnerských programov, partnerov, nákupov a vernostných bodov.",
  metadataBase: new URL(env.APP_BASE_URL),
  appleWebApp: { capable: true, title: "PartnersProgram", statusBarStyle: "default" },
  icons: { apple: "/pwa/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#0b1020",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sk" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
