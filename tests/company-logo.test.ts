import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import sharp from "sharp";

import {
  COMPANY_LOGO_MAX_BYTES,
  CompanyLogoError,
  companyLogoDataUrl,
  normalizeCompanyLogo,
  parseCompanyLogoUpload,
} from "../src/server/company-logo";

function image(width = 32, height = 16) {
  return sharp({ create: { width, height, channels: 4, background: "#28609580" } });
}

function upload(bytes: Uint8Array, type = "image/png", field = "file") {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(bytes)], { type }), "logo");
  return new Request("https://partners.example.invalid/api/company/logo", { method: "PUT", body: form });
}

const invalid = (error: unknown) => error instanceof CompanyLogoError && error.status === 400;
const tooLarge = (error: unknown) => error instanceof CompanyLogoError && error.status === 413;

test("PNG, JPEG and WebP normalize to bounded metadata-free PNG with a content hash", async () => {
  for (const format of ["png", "jpeg", "webp"] as const) {
    const bytes = await image(1600, 400).toFormat(format).withMetadata().toBuffer();
    const normalized = await normalizeCompanyLogo(bytes, `image/${format}`);
    const metadata = await sharp(normalized.logoData).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, 512);
    assert.equal(metadata.height, 128);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(normalized.logoVersion, createHash("sha256").update(normalized.logoData).digest("hex"));
    assert.ok(normalized.logoData.length < COMPANY_LOGO_MAX_BYTES);
  }
});

test("small logos are not enlarged, transparent pixels survive, and JPEG orientation is applied", async () => {
  const png = await normalizeCompanyLogo(await image().png().toBuffer(), "image/png");
  const metadata = await sharp(png.logoData).metadata();
  assert.equal(metadata.width, 32);
  assert.equal(metadata.height, 16);
  assert.equal(metadata.hasAlpha, true);
  const jpeg = await image(100, 40).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const rotated = await normalizeCompanyLogo(jpeg, "image/jpeg");
  const rotatedMetadata = await sharp(rotated.logoData).metadata();
  assert.equal(rotatedMetadata.width, 40);
  assert.equal(rotatedMetadata.height, 100);
  assert.equal(rotatedMetadata.orientation, undefined);
  assert.equal(rotatedMetadata.exif, undefined);
});

test("invalid, spoofed, forbidden, truncated and animated images are rejected", async () => {
  const png = await image().png().toBuffer();
  const gif = await image().gif().toBuffer();
  for (const [bytes, type] of [
    [Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/>"), "image/svg+xml"],
    [gif, "image/gif"],
    [gif, "image/png"],
    [png, "image/jpeg"],
    [Buffer.from("not an image"), "image/png"],
    [png.subarray(0, Math.floor(png.length / 2)), "image/png"],
    [Buffer.alloc(0), "image/png"],
  ] as const) await assert.rejects(normalizeCompanyLogo(bytes, type), invalid);

  // libvips may decode only the first APNG frame; reject the animation declaration itself.
  const animationChunk = Buffer.alloc(20);
  animationChunk.writeUInt32BE(8, 0);
  animationChunk.write("acTL", 4);
  animationChunk.writeUInt32BE(2, 8);
  const apng = Buffer.concat([png.subarray(0, 33), animationChunk, png.subarray(33)]);
  await assert.rejects(normalizeCompanyLogo(apng, "image/png"), invalid);
  const jpeg = await image().jpeg().toBuffer();
  const mpo = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe2, 0, 6, 77, 80, 70, 0]), jpeg.subarray(2)]);
  await assert.rejects(normalizeCompanyLogo(mpo, "image/jpeg"), invalid);
  const animatedWebp = await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), {
    raw: { width: 1, height: 2, channels: 3, pageHeight: 1 },
  }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animatedWebp).metadata()).pages, 2);
  await assert.rejects(normalizeCompanyLogo(animatedWebp, "image/webp"), invalid);
});

test("the input byte limit and decoded pixel limit are enforced before storing", async () => {
  await assert.rejects(normalizeCompanyLogo(Buffer.alloc(COMPANY_LOGO_MAX_BYTES + 1), "image/png"), tooLarge);
  const largePixels = await image(4001, 4000).png().toBuffer();
  assert.ok(largePixels.length < COMPANY_LOGO_MAX_BYTES);
  await assert.rejects(normalizeCompanyLogo(largePixels, "image/png"), invalid);
  const boundary = await image(4000, 4000).png().toBuffer();
  assert.equal((await sharp((await normalizeCompanyLogo(boundary, "image/png")).logoData).metadata()).height, 256);
});

test("multipart parsing requires exactly one valid file and bounds declared and streamed bodies", async () => {
  const png = await image().png().toBuffer();
  assert.equal((await parseCompanyLogoUpload(upload(png))).logoVersion.length, 64);
  await assert.rejects(parseCompanyLogoUpload(upload(png, "image/png", "other")), invalid);
  await assert.rejects(parseCompanyLogoUpload(upload(Buffer.alloc(0))), invalid);
  await assert.rejects(parseCompanyLogoUpload(upload(Buffer.alloc(COMPANY_LOGO_MAX_BYTES + 1))), tooLarge);
  await assert.rejects(parseCompanyLogoUpload(new Request("https://example.test", {
    method: "PUT", body: png, headers: { "Content-Type": "image/png" },
  })), invalid);
  const duplicate = new FormData();
  duplicate.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "one.png");
  duplicate.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "two.png");
  await assert.rejects(parseCompanyLogoUpload(new Request("https://example.test", { method: "PUT", body: duplicate })), invalid);
  for (const declared of [false, true]) {
    const request = new Request("https://example.test", {
      method: "PUT",
      headers: { "Content-Type": "multipart/form-data; boundary=x", ...(declared ? { "Content-Length": "9999999" } : {}) },
      body: Buffer.alloc(COMPANY_LOGO_MAX_BYTES + 65537),
    });
    await assert.rejects(parseCompanyLogoUpload(request), tooLarge);
  }
  await assert.rejects(parseCompanyLogoUpload(new Request("https://example.test", {
    method: "PUT", headers: { "Content-Type": "multipart/form-data; boundary=x" }, body: "broken",
  })), invalid);
});

test("data URLs embed only normalized PNG bytes and missing logos stay absent", async () => {
  assert.equal(companyLogoDataUrl(null), null);
  assert.equal(companyLogoDataUrl(undefined), null);
  assert.equal(companyLogoDataUrl(new Uint8Array()), null);
  const { logoData } = await normalizeCompanyLogo(await image().png().toBuffer(), "image/png");
  assert.equal(companyLogoDataUrl(logoData), `data:image/png;base64,${logoData.toString("base64")}`);
});
