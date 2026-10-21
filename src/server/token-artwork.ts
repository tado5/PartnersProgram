import QRCode from "qrcode";
import { env } from "@/lib/env";

export async function tokenArtwork(value: string) {
  const url = new URL(`/k/${value}`, `${env.APP_BASE_URL.replace(/\/+$/, "")}/`).toString();
  const [qrSvg, qrPng] = await Promise.all([
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 2, width: 320 }),
    QRCode.toDataURL(url, { type: "image/png", errorCorrectionLevel: "H", margin: 2, width: 512 }),
  ]);
  return { value, url, qrSvg, qrPng };
}
