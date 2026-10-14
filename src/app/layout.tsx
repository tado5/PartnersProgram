import type { Metadata } from "next";
import { env } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Europodlahy | Partnerský program",
  description: "Evidencia partnerov a vernostných bodov Europodlahy.",
  metadataBase: new URL(env.APP_BASE_URL),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sk" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
