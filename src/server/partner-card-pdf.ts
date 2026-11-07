import PDFDocument from "pdfkit";
import path from "node:path";
import sharp from "sharp";

import { CARD_HEIGHT_MM, CARD_WIDTH_MM, renderPartnerCardSvg, type PartnerCardArtwork } from "@/lib/partner-card";

const mm = (value: number) => value * 72 / 25.4;

export async function renderPartnerCardPdf(input: PartnerCardArtwork, format: "card" | "a4"): Promise<Buffer> {
  const images = await Promise.all((["front", "back"] as const).map((side) =>
    sharp(Buffer.from(renderPartnerCardSvg(input, side)), { density: 600 }).png().toBuffer(),
  ));
  const width = mm(CARD_WIDTH_MM);
  const height = mm(CARD_HEIGHT_MM);
  const doc = new PDFDocument({
    autoFirstPage: false,
    font: path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans.ttf"),
    info: { Title: `${input.partnerCode} - Partnerská karta`, Creator: "PartnersProgram" },
  });
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  for (const [index, image] of images.entries()) {
    doc.addPage({ size: format === "a4" ? "A4" : [width, height], margin: 0 });
    const x = (doc.page.width - width) / 2;
    const y = (doc.page.height - height) / 2;
    doc.image(image, x, y, { width, height });
    if (format === "a4") {
      doc.fillColor("#222222").fontSize(11).text(
        index === 0 ? "Partnerská karta · Predná strana" : "Partnerská karta · Zadná strana",
        mm(20), mm(22), { width: doc.page.width - mm(40), align: "center" },
      );
      doc.fontSize(9).text(
        "Rozmer karty: 85,60 × 53,98 mm. Tlač: Skutočná veľkosť / 100 %.",
        mm(20), mm(31), { width: doc.page.width - mm(40), align: "center" },
      );
      doc.strokeColor("#444444").lineWidth(0.4);
      for (const [cx, cy, dx, dy] of [
        [x, y, -1, -1], [x + width, y, 1, -1],
        [x, y + height, -1, 1], [x + width, y + height, 1, 1],
      ]) {
        doc.moveTo(cx + dx * mm(1), cy).lineTo(cx + dx * mm(4), cy).stroke();
        doc.moveTo(cx, cy + dy * mm(1)).lineTo(cx, cy + dy * mm(4)).stroke();
      }
      const rulerX = (doc.page.width - mm(50)) / 2;
      const rulerY = y + height + mm(23);
      doc.moveTo(rulerX, rulerY).lineTo(rulerX + mm(50), rulerY).stroke();
      for (let index = 0; index <= 5; index++) {
        const tickX = rulerX + mm(index * 10);
        doc.moveTo(tickX, rulerY - mm(1.5)).lineTo(tickX, rulerY + mm(1.5)).stroke();
      }
      doc.fontSize(8).text("Kontrolná mierka: táto čiara musí mať 50 mm.",
        mm(20), rulerY + mm(5), { width: doc.page.width - mm(40), align: "center" });
    }
  }
  doc.end();
  return complete;
}
