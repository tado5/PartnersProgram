export function companyLogoDataUrl(data: Uint8Array | null | undefined): string | null {
  return data?.byteLength ? `data:image/png;base64,${Buffer.from(data).toString("base64")}` : null;
}
