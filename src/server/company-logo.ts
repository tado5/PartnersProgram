import { createHash } from "node:crypto";
import sharp from "sharp";

export const COMPANY_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const COMPANY_LOGO_MAX_PIXELS = 16_000_000;
const MAX_MULTIPART_BYTES = COMPANY_LOGO_MAX_BYTES + 64 * 1024;

export class CompanyLogoError extends Error {
  constructor(
    public code = "INVALID_LOGO",
    message = "Vyberte platný statický obrázok PNG, JPEG alebo WebP.",
    public status: 400 | 413 = 400,
  ) {
    super(message);
  }
}

function tooLarge() {
  return new CompanyLogoError("LOGO_TOO_LARGE", "Logo môže mať najviac 2 MiB.", 413);
}

function imageFormat(bytes: Buffer): "png" | "jpeg" | "webp" | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function hasAnimationChunk(bytes: Buffer, format: "png" | "jpeg" | "webp") {
  if (format === "jpeg") {
    // MPO uses a JPEG APP2 index; a first-frame-only decoder can otherwise accept it.
    let offset = 2;
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0xff) { offset++; continue; }
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) break;
      if (marker === 0xe2 && bytes.toString("ascii", offset + 4, offset + 8) === "MPF\0") return true;
      offset += length + 2;
    }
    return false;
  }
  let offset = format === "png" ? 8 : 12;
  while (offset + 8 <= bytes.length) {
    const length = format === "png" ? bytes.readUInt32BE(offset) : bytes.readUInt32LE(offset + 4);
    const name = bytes.toString("ascii", offset + (format === "png" ? 4 : 0), offset + (format === "png" ? 8 : 4));
    if (name === "acTL" || name === "ANIM" || name === "ANMF") return true;
    offset += format === "png" ? length + 12 : length + 8 + (length % 2);
  }
  return false;
}

export async function normalizeCompanyLogo(
  input: Uint8Array,
  contentType: string,
): Promise<{ logoData: Buffer; logoVersion: string }> {
  if (input.byteLength > COMPANY_LOGO_MAX_BYTES) throw tooLarge();
  const bytes = Buffer.from(input);
  const format = imageFormat(bytes);
  if (!format || contentType !== `image/${format}` || hasAnimationChunk(bytes, format)) {
    throw new CompanyLogoError();
  }
  try {
    const image = sharp(bytes, { limitInputPixels: COMPANY_LOGO_MAX_PIXELS, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== format || !metadata.width || !metadata.height ||
        metadata.width * metadata.height > COMPANY_LOGO_MAX_PIXELS ||
        (metadata.pages ?? 1) !== 1) throw new CompanyLogoError();
    const logoData = await image.rotate()
      .resize({ width: 512, height: 256, fit: "inside", withoutEnlargement: true })
      .png().toBuffer();
    return { logoData, logoVersion: createHash("sha256").update(logoData).digest("hex") };
  } catch (error) {
    if (error instanceof CompanyLogoError) throw error;
    throw new CompanyLogoError();
  }
}

export async function parseCompanyLogoUpload(request: Request) {
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get("content-type") ?? "")) {
    throw new CompanyLogoError();
  }
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_MULTIPART_BYTES) throw tooLarge();
  if (!request.body) throw new CompanyLogoError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
    const entries = [...form.entries()];
    const file = form.get("file");
    if (entries.length !== 1 || !file || typeof file === "string" || file.size === 0) {
      throw new CompanyLogoError();
    }
    if (file.size > COMPANY_LOGO_MAX_BYTES) throw tooLarge();
    return await normalizeCompanyLogo(new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (error) {
    if (error instanceof CompanyLogoError) throw error;
    throw new CompanyLogoError();
  } finally {
    reader.releaseLock();
  }
}

export { companyLogoDataUrl } from "@/lib/company-logo";
