import path from "node:path";

import type { PartnerType } from "@prisma/client";
import PDFDocument from "pdfkit";

import { periodLabel, type PeriodValue } from "@/lib/period";
import type { getPeriodReport } from "@/server/reports";

type Report = Awaited<ReturnType<typeof getPeriodReport>>;

const fontDir = path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf");
const FONT = path.join(fontDir, "DejaVuSans.ttf");
const FONT_BOLD = path.join(fontDir, "DejaVuSans-Bold.ttf");

const typeLabels: Record<PartnerType, string> = {
  installer: "Montážnik",
  company: "Firma",
  referrer: "Odporúčateľ",
};

const podium = [
  { label: "1. miesto", fill: "#fef3c7", stroke: "#f59e0b", text: "#92400e" },
  { label: "2. miesto", fill: "#f1f5f9", stroke: "#94a3b8", text: "#334155" },
  { label: "3. miesto", fill: "#ffedd5", stroke: "#fb923c", text: "#9a3412" },
];

const money = new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("sk-SK");
// DejaVu renders a regular no-break space reliably; sk-SK grouping uses narrow ones.
const clean = (value: string) => value.replace(/[\u202f\u2009]/g, "\u00a0");
const eur = (value: string) => `${clean(money.format(Number(value)))}\u00a0€`;
const num = (value: number) => clean(integer.format(value));

export function reportFileName(companySlug: string, period: PeriodValue) {
  const suffix = period.month ?? `${period.from}_${period.to}`;
  return `report-${companySlug}-${suffix}.pdf`;
}

export async function renderReportPdf(input: {
  companyName: string;
  companyLogo?: Uint8Array | null;
  period: PeriodValue;
  type?: PartnerType;
  report: Report;
  generatedBy: string;
  timeZone: string;
  now?: Date;
}): Promise<Buffer> {
  const { report, period } = input;
  const doc = new PDFDocument({
    size: "A4", margin: 40, bufferPages: true, font: FONT,
    info: {
      Title: `${period.month ? "Mesačný report" : "Report za obdobie"} – ${periodLabel(period)}`,
      Author: input.companyName,
      Creator: "PartnersProgram – partnerský program",
    },
  });
  doc.registerFont("regular", FONT);
  doc.registerFont("bold", FONT_BOLD);
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

  // Header
  if (input.companyLogo) {
    doc.image(Buffer.from(input.companyLogo), left, 40, { fit: [160, 48] });
    doc.y = 96;
  } else {
    doc.font("bold").fontSize(9).fillColor("#92400e").text(input.companyName, left, 40);
  }
  doc.font("bold").fontSize(20).fillColor("#0c0a09")
    .text(period.month ? "Mesačný report" : "Report za obdobie", left, doc.y + 4);
  doc.font("regular").fontSize(10).fillColor("#57534e");
  const generated = new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium", timeStyle: "short", timeZone: input.timeZone,
  }).format(input.now ?? new Date());
  const meta = [
    `Firma: ${input.companyName}`,
    `Obdobie: ${period.month ? `${periodLabel(period)} (${formatDay(period.from)} – ${formatDay(period.to)})` : periodLabel(period)}`,
    `Typ partnera: ${input.type ? typeLabels[input.type] : "všetky typy"}`,
    `Vygenerované: ${clean(generated)} · ${input.generatedBy}`,
  ];
  doc.text(meta.join("\n"), left, doc.y + 6, { lineGap: 2 });

  // Summary
  let y = doc.y + 14;
  const metrics: [string, string][] = [
    ["Obrat bez DPH", eur(report.summary.netAmount)],
    ["Tržba s DPH", eur(report.summary.grossAmount)],
    ["Body", num(report.summary.points)],
    ["Počet nákupov", num(report.summary.purchases)],
  ];
  const gap = 8;
  const boxW = (width - gap * (metrics.length - 1)) / metrics.length;
  metrics.forEach(([label, value], index) => {
    const x = left + index * (boxW + gap);
    doc.roundedRect(x, y, boxW, 52, 6).lineWidth(0.8).strokeColor("#e7e5e4").stroke();
    doc.font("regular").fontSize(8.5).fillColor("#57534e").text(label, x + 10, y + 9, { width: boxW - 20 });
    doc.font("bold").fontSize(14).fillColor("#0c0a09").text(value, x + 10, y + 25, { width: boxW - 20 });
  });
  y += 52 + 18;

  // Top 3
  doc.font("bold").fontSize(13).fillColor("#0c0a09").text("Top partneri", left, y);
  doc.font("regular").fontSize(8.5).fillColor("#57534e").text("Poradie podľa tržby bez DPH.", left, doc.y + 1);
  y = doc.y + 8;
  const top = report.partners.slice(0, 3);
  if (top.length) {
    const cardW = (width - gap * 2) / 3;
    top.forEach((partner, index) => {
      const style = podium[index];
      const x = left + index * (cardW + gap);
      doc.roundedRect(x, y, cardW, 92, 8).lineWidth(1).fillAndStroke(style.fill, style.stroke);
      doc.font("bold").fontSize(8.5).fillColor(style.text).text(style.label, x + 10, y + 9, { width: cardW - 20, continued: false });
      doc.font("regular").fontSize(8).fillColor("#57534e").text(partner.code, x + 10, y + 9, { width: cardW - 20, align: "right" });
      doc.font("bold").fontSize(10).fillColor("#0c0a09")
        .text(partner.displayName, x + 10, y + 24, { width: cardW - 20, height: 13, ellipsis: true, lineBreak: false });
      doc.font("bold").fontSize(20).fillColor(style.text).text(`${num(partner.points)} bodov`, x + 10, y + 42, { width: cardW - 20 });
      doc.font("regular").fontSize(8).fillColor("#44403c")
        .text(`Tržba ${eur(partner.netAmount)} bez DPH\n${eur(partner.grossAmount)} s DPH`, x + 10, y + 66, { width: cardW - 20 });
    });
    y += 92 + 20;
  } else {
    doc.font("regular").fontSize(10).fillColor("#57534e").text("Za toto obdobie nie sú evidované nákupy.", left, y);
    y = doc.y + 20;
  }

  // Partner table
  const columns = [
    { key: "rank", label: "#", width: 24, align: "right" as const },
    { key: "partner", label: "Partner", width: 0, align: "left" as const },
    { key: "type", label: "Typ", width: 70, align: "left" as const },
    { key: "purchases", label: "Nákupov", width: 60, align: "right" as const },
    { key: "points", label: "Body", width: 54, align: "right" as const },
    { key: "gross", label: "S DPH", width: 72, align: "right" as const },
    { key: "net", label: "Bez DPH", width: 72, align: "right" as const },
  ];
  columns[1].width = width - columns.reduce((sum, column) => sum + column.width, 0);
  const rowH = 20;
  const pad = 5;

  const drawHeader = () => {
    doc.rect(left, y, width, rowH).fill("#f5f5f4");
    let x = left;
    doc.font("bold").fontSize(7.5).fillColor("#57534e");
    for (const column of columns) {
      doc.text(column.label.toUpperCase(), x + pad, y + 6.5, { width: column.width - pad * 2, align: column.align, lineBreak: false });
      x += column.width;
    }
    y += rowH;
  };

  doc.font("bold").fontSize(13).fillColor("#0c0a09").text("Partneri podľa obratu", left, y);
  y = doc.y + 6;
  if (!report.partners.length) {
    doc.font("regular").fontSize(10).fillColor("#57534e").text("Za toto obdobie nie sú evidované nákupy.", left, y);
  } else {
    drawHeader();
    report.partners.forEach((partner, index) => {
      if (y + rowH > bottom()) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader();
      }
      if (index % 2) doc.rect(left, y, width, rowH).fill("#fafaf9");
      const cells: Record<string, string> = {
        rank: String(index + 1),
        partner: `${partner.displayName}  ·  ${partner.code}`,
        type: typeLabels[partner.type],
        purchases: num(partner.purchases),
        points: num(partner.points),
        gross: eur(partner.grossAmount),
        net: eur(partner.netAmount),
      };
      let x = left;
      for (const column of columns) {
        const bold = column.key === "points" || column.key === "net";
        doc.font(bold ? "bold" : "regular").fontSize(column.key === "points" ? 9.5 : 8.5).fillColor("#1c1917")
          .text(cells[column.key], x + pad, y + (column.key === "points" ? 5.5 : 6), {
            width: column.width - pad * 2, align: column.align, lineBreak: false, ellipsis: true, height: rowH,
          });
        x += column.width;
      }
      doc.moveTo(left, y + rowH).lineTo(left + width, y + rowH).lineWidth(0.5).strokeColor("#e7e5e4").stroke();
      y += rowH;
    });
  }

  // Footer on every page
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    // Writing inside the bottom margin would otherwise make pdfkit add a new page.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const footerY = doc.page.height - 30;
    doc.font("regular").fontSize(7.5).fillColor("#78716c");
    doc.text("Body a odznaky sa počítajú zo sumy bez DPH. Zmazané nákupy nie sú zahrnuté.", left, footerY, {
      width, lineBreak: false,
    });
    doc.text(`Strana ${index + 1} z ${range.count}`, left, footerY, { width, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();
  return done;
}

function formatDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${day}. ${month}. ${year}`;
}
