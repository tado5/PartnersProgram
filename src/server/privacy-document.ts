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
      * { box-sizing: border-box; }
      :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #fff; background: #000; }
      body { min-height: 100dvh; margin: 0; padding: 1rem; background: radial-gradient(ellipse at 12% 8%, rgba(0,128,255,.25), transparent 38rem), radial-gradient(ellipse at 88% 18%, rgba(139,0,255,.2), transparent 36rem), radial-gradient(ellipse at 72% 82%, rgba(255,20,147,.14), transparent 38rem), radial-gradient(ellipse at 16% 86%, rgba(32,178,170,.14), transparent 34rem), #000; font-size: 16px; line-height: 1.6; }
      main { max-width: 52rem; margin: 1rem auto; padding: clamp(1rem, 4vw, 2rem); border: 1px solid rgba(255,255,255,.12); border-radius: 1rem; background: rgba(0,0,0,.78); overflow-wrap: anywhere; }
      h1 { font-size: clamp(1.5rem,6vw,2.25rem); line-height: 1.2; } h2 { font-size: 1.25rem; }
      dt { font-weight: bold; margin-top: .75rem; }
      dd { margin-left: 0; }
      .body { white-space: pre-wrap; border-top: 1px solid rgba(255,255,255,.2); margin-top: 1.5rem; padding-top: 1.5rem; }
      .note { font-size: .875rem; color: rgba(255,255,255,.75); }
      .warning { border: 1px solid rgba(0,128,255,.55); border-radius: .75rem; background: rgba(0,128,255,.12); padding: 1rem; }
      a { color: #0080ff; } a:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
      .download { display: inline-block; padding: .65rem 1rem; border: 1px solid rgba(255,255,255,.2); border-radius: .5rem; background: #0080ff; color: #000; font-weight: 600; text-decoration: none; }
      @supports not (backdrop-filter: blur(15px)) { main { background: rgba(0,0,0,.9); } }
      @media (prefers-reduced-transparency: reduce) { main { background: rgba(0,0,0,.9); } }
      @media print {
        :root { color-scheme: light; color: #000; background: #fff; }
        body { min-height: 0; padding: 0; background: #fff; color: #000; }
        main { max-width: none; margin: 0; padding: 0; border: 0; border-radius: 0; background: #fff; color: #000; }
        .note { color: #333; } .warning { border-color: #777; background: #fff; }
        a { color: #000; } .download { display: none; }
      }
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
