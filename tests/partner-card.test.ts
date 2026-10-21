import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import QRCode from "qrcode";
import sharp from "sharp";
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";

import { renderPartnerCardSvg, type PartnerCardArtwork } from "../src/lib/partner-card";
import { renderPartnerCardPdf } from "../src/server/partner-card-pdf";

const cardUrl = `https://partners.example.invalid/k/${"A".repeat(43)}`;

async function artwork(): Promise<PartnerCardArtwork> {
  return {
    companyName: "Podlahy & partneri",
    companyLogoUrl: null,
    partnerName: "Ľuboš Černý <partner>",
    partnerCode: "EP-12345",
    qrPng: await QRCode.toDataURL(cardUrl, { width: 512, margin: 2, errorCorrectionLevel: "H" }),
  };
}

test("card artwork escapes names, preserves dimensions and never embeds external logos", async () => {
  const input = await artwork();
  const svg = renderPartnerCardSvg({ ...input, companyLogoUrl: "https://example.invalid/logo.png" }, "front");
  assert.match(svg, /width="85.6mm" height="53.98mm"/);
  assert.match(svg, /Ľuboš Černý &lt;partner&gt;/);
  assert.match(svg, /Podlahy &amp; partneri/);
  assert.doesNotMatch(svg, /https:\/\/example.invalid/);
  assert.doesNotMatch(svg, /<partner>/);
  const long = renderPartnerCardSvg({ ...input, partnerName: "Dlhé meno ".repeat(20) }, "front");
  assert.match(long, /lengthAdjust="spacingAndGlyphs"/);
});

test("the QR on the complete rear artwork can be decoded at print size", async () => {
  const svg = renderPartnerCardSvg(await artwork(), "back");
  const { data, info } = await sharp(Buffer.from(svg), { density: 300 }).flatten({ background: "white" })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(
    new Uint8ClampedArray(data), info.width, info.height,
  )));
  assert.equal(new QRCodeReader().decode(bitmap).getText(), cardUrl);
});

test("card PDF has two physical card-sized pages and A4 has two centered print pages", async () => {
  const input = await artwork();
  const logo = await sharp({ create: { width: 120, height: 40, channels: 4, background: "#286095" } }).png().toBuffer();
  input.companyLogoUrl = `data:image/png;base64,${logo.toString("base64")}`;
  assert.ok(renderPartnerCardSvg(input, "front").includes(input.companyLogoUrl));
  for (const format of ["card", "a4"] as const) {
    const pdf = await renderPartnerCardPdf(input, format);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    const source = pdf.toString("latin1");
    assert.match(source, /\/Count 2\b/);
    const boxes = [...source.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
    assert.equal(boxes.length, 2);
    for (const box of boxes) {
      const expected = format === "card" ? [85.6 * 72 / 25.4, 53.98 * 72 / 25.4] : [595.28, 841.89];
      assert.ok(Math.abs(Number(box[1]) - expected[0]) < 0.01);
      assert.ok(Math.abs(Number(box[2]) - expected[1]) < 0.01);
    }
    const streams = [...source.matchAll(/<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)]
      .filter((match) => !match[1].includes("/Subtype /Image") && match[1].includes("/FlateDecode"))
      .map((match) => inflateSync(Buffer.from(match[2], "latin1")).toString("latin1"));
    const placements = streams.flatMap((stream) => [
      ...stream.matchAll(/([\d.]+) 0 0 (-?[\d.]+) ([\d.]+) ([\d.]+) cm\s*\/I\d+ Do/g),
    ]);
    assert.equal(placements.length, 2, "both PDF pages must place the complete card artwork");
    for (const placement of placements) {
      const width = Number(placement[1]);
      const height = Math.abs(Number(placement[2]));
      assert.ok(Math.abs(width * 25.4 / 72 - 85.6) < 0.001);
      assert.ok(Math.abs(height * 25.4 / 72 - 53.98) < 0.001);
      const pageWidth = format === "card" ? width : 595.28;
      const pageHeight = format === "card" ? height : 841.89;
      assert.ok(Math.abs(Number(placement[3]) - (pageWidth - width) / 2) < 0.001);
      assert.ok(Math.abs(Number(placement[4]) - (pageHeight + height) / 2) < 0.001);
    }
  }
});
