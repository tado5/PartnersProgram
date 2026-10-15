import path from "node:path";
import PDFDocument from "pdfkit";

import { escapeHtml } from "@/lib/html";
import type { PrivacyDraftInput } from "@/lib/privacy";
import { privacyTemplateBody, privacyTemplateSources, PRIVACY_TEMPLATE_REVISION, PRIVACY_TEMPLATE_URL } from "@/lib/privacy-template";

export type PrivacyDocument = PrivacyDraftInput & {
  companyName: string;
  versionLabel: string;
  template: boolean;
};

export function privacyTemplateDocument(): PrivacyDocument {
  return {
    companyName: "Partnerský program", versionLabel: `Znenie dokumentu ${PRIVACY_TEMPLATE_REVISION}`,
    template: true, controllerName: "", controllerAddress: "", controllerIco: null,
    contactEmail: "", dpoContact: null,
    body: privacyTemplateBody,
  };
}

const generalNote = "Spoločný dokument partnerského programu. Prevádzkovateľom vašich údajov je firma, v ktorej ste registrovaný; jej identifikáciu, kontakty a platnú verziu oznámenia nájdete cez odkaz Ochrana osobných údajov na svojej partnerskej karte. Firma môže svoje podmienky upraviť v nastaveniach; pri rozdiele platí jej publikované oznámenie.";

function identity(document: PrivacyDocument): [string, string][] {
  if (document.template) return [];
  return [
    ["Prevádzkovateľ", document.controllerName], ["Sídlo", document.controllerAddress],
    ...(document.controllerIco ? [["IČO", document.controllerIco] as [string, string]] : []),
    ["Kontakt pre ochranu údajov", document.contactEmail],
    ...(document.dpoContact ? [["Zodpovedná osoba", document.dpoContact] as [string, string]] : []),
  ];
}

export function privacyDocumentHtml(document: PrivacyDocument, downloadUrl: string) {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow"><title>Ochrana osobných údajov</title>
    <style>
      * { box-sizing: border-box; } body { margin: 0; background: #fafaf9; color: #1c1917; font: 16px/1.6 system-ui,sans-serif; }
      main { max-width: 52rem; margin: 2rem auto; padding: 1.5rem; background: white; overflow-wrap: anywhere; }
      h1 { font-size: clamp(1.5rem,6vw,2rem); } dt { font-weight: bold; margin-top: .75rem; }
      dd { margin-left: 0; } .body { white-space: pre-wrap; border-top: 1px solid #ddd; margin-top: 1.5rem; padding-top: 1.5rem; }
      .note { font-size: .875rem; color: #57534e; } .warning { background: #fffbeb; padding: 1rem; }
      a { color: #92400e; } .download { display: inline-block; padding: .65rem 1rem; border: 1px solid #92400e; border-radius: .4rem; }
      @media print { main { margin: 0; max-width: none; } .download { display: none; } }
    </style></head><body><main>
    <h1>Ochrana osobných údajov</h1>
    <p>${escapeHtml(document.companyName)} · ${escapeHtml(document.versionLabel)}</p>
    ${document.template ? `<p class="warning">${escapeHtml(generalNote)}</p>` : ""}
    <p><a class="download" href="${escapeHtml(downloadUrl)}" download>Stiahnuť PDF</a></p>
    <dl>${identity(document).map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>
    <section aria-label="Informačné oznámenie" class="body">${escapeHtml(document.body)}</section>
    <p class="note">Toto je informačné oznámenie, nie žiadosť o súhlas. Svoje práva uplatnite u uvedeného prevádzkovateľa.</p>
    ${document.template ? `<aside class="note"><h2>Právne podklady</h2>
      <ul>${privacyTemplateSources.map((source) => `<li><a href="${escapeHtml(source.url)}" rel="noreferrer">${escapeHtml(source.label)}</a></li>`).join("")}</ul></aside>` : ""}
    </main></body></html>`;
}

export async function renderPrivacyDocumentPdf(document: PrivacyDocument): Promise<Buffer> {
  const fonts = path.join(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf");
  const pdf = new PDFDocument({
    size: "A4", margins: { top: 48, bottom: 56, left: 48, right: 48 },
    font: path.join(fonts, "DejaVuSans.ttf"), bufferPages: true,
    info: { Title: "Ochrana osobných údajov", Author: document.companyName },
  });
  pdf.registerFont("regular", path.join(fonts, "DejaVuSans.ttf"));
  pdf.registerFont("bold", path.join(fonts, "DejaVuSans-Bold.ttf"));
  const chunks: Buffer[] = [];
  pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  pdf.font("bold").fontSize(18).text("Ochrana osobných údajov");
  pdf.moveDown().font("regular").fontSize(10).text(document.companyName).text(document.versionLabel);
  if (document.template) pdf.moveDown().text(generalNote);
  pdf.moveDown();
  for (const [label, value] of identity(document)) pdf.text(`${label}: ${value}`, { lineGap: 3 });
  pdf.moveDown();
  for (const paragraph of document.body.split(/\n\s*\n/)) {
    pdf.font(/^\d+\.\s/.test(paragraph) || paragraph.startsWith("INFORMÁCIE") ? "bold" : "regular")
      .fontSize(10).text(paragraph, { lineGap: 3 }).moveDown(0.6);
  }
  pdf.font("regular").fontSize(9).text("Toto oznámenie nie je žiadosť o súhlas so spracúvaním osobných údajov.");
  if (document.template) {
    pdf.moveDown().text(`Dokument je dostupný na ${PRIVACY_TEMPLATE_URL}. Podklady:`);
    for (const source of privacyTemplateSources) pdf.moveDown(0.4).text(`${source.label}: ${source.url}`);
  }
  const range = pdf.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    pdf.switchToPage(index);
    // PDFKit would otherwise paginate a footer placed inside the bottom margin.
    const bottomMargin = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0;
    pdf.font("regular").fontSize(8).fillColor("#57534e").text(
      `${index + 1} / ${range.count}`,
      48, pdf.page.height - 42, { lineBreak: false, width: pdf.page.width - 96, align: "right" },
    );
    pdf.page.margins.bottom = bottomMargin;
  }
  pdf.end();
  return done;
}

export const privacyDocumentHeaders = {
  "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
};

export async function privacyDocumentResponse(document: PrivacyDocument, downloadUrl: string, fileName: string, pdf: boolean) {
  if (pdf) return new Response(new Uint8Array(await renderPrivacyDocumentPdf(document)), {
    headers: { ...privacyDocumentHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName}"` },
  });
  return new Response(privacyDocumentHtml(document, downloadUrl), {
    headers: { ...privacyDocumentHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}
