import type { Metadata } from "next";
import { env } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "PartnersProgram | Partnerský program",
  description: "Správa partnerských programov, partnerov, nákupov a vernostných bodov.",
  metadataBase: new URL(env.APP_BASE_URL),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sk" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
