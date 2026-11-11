import { openSync, type Font } from "fontkit";
import path from "node:path";

import type { CardTextRenderer } from "@/lib/partner-card";

export const cardFontPath = path.join(process.cwd(), "src", "assets", "fonts", "DejaVuSans.ttf");
const boldFontPath = path.join(process.cwd(), "src", "assets", "fonts", "DejaVuSans-Bold.ttf");
let fonts: { regular: Font; bold: Font } | undefined;

function loadFont(filename: string): Font {
  const font = openSync(filename);
  if ("fonts" in font) throw new Error("Card artwork requires a single font, not a font collection.");
  return font;
}

// SVG rasterizers on minimal hosts may have no system fonts. Outlines avoid font discovery entirely.
export const renderCardTextPaths: CardTextRenderer = (value, x, y, size, width, extra = "") => {
  fonts ??= { regular: loadFont(cardFontPath), bold: loadFont(boldFontPath) };
  const font = extra.includes('font-weight="700"') ? fonts.bold : fonts.regular;
  const run = font.layout(value);
  const scale = size / font.unitsPerEm;
  const spacing = Number(extra.match(/letter-spacing="(-?[\d.]+)"/)?.[1] ?? 0) / scale;
  const naturalWidth = run.advanceWidth + Math.max(0, run.glyphs.length - 1) * spacing;
  const fit = Array.from(value).length * size * 0.65 > width && naturalWidth > 0
    ? width / (naturalWidth * scale) : 1;
  let cursorX = 0;
  let cursorY = 0;
  const paths = run.glyphs.map((glyph, index) => {
    const position = run.positions[index];
    const outline = glyph.path.toSVG();
    const result = outline
      ? `<path transform="translate(${cursorX + position.xOffset} ${cursorY + position.yOffset})" d="${outline}"/>`
      : "";
    cursorX += position.xAdvance + spacing;
    cursorY += position.yAdvance;
    return result;
  }).join("");
  return `<g ${extra} transform="translate(${x} ${y}) scale(${scale * fit} ${-scale})">${paths}</g>`;
};
