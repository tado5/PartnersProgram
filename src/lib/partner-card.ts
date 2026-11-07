export const CARD_WIDTH_MM = 85.6;
export const CARD_HEIGHT_MM = 53.98;
export const CARD_CORNER_RADIUS_MM = 3.18;

export type PartnerCardArtwork = {
  companyName: string;
  companyLogoUrl: string | null;
  partnerName: string;
  partnerCode: string;
  qrPng: string;
};

export function escapeCardText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function text(value: string, x: number, y: number, size: number, width: number, extra = "") {
  const fit = Array.from(value).length * size * 0.65 > width
    ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"` : "";
  return `<text x="${x}" y="${y}" font-size="${size}"${fit} ${extra}>${escapeCardText(value)}</text>`;
}

export function renderPartnerCardSvg(input: PartnerCardArtwork, side: "front" | "back"): string {
  const logo = input.companyLogoUrl?.startsWith("data:image/png;base64,")
    ? `<rect x="52" y="44" width="196" height="84" rx="14" fill="white"/>
       <image href="${escapeCardText(input.companyLogoUrl)}" x="64" y="52" width="172" height="68" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  const front = `
    ${logo}
    ${text(input.companyName, logo ? 278 : 52, 94, 28, logo ? 510 : 750, 'font-weight="700"')}
    <rect x="52" y="177" width="54" height="5" rx="2.5" fill="#0080ff"/>
    <text x="52" y="219" font-size="16" letter-spacing="3" fill="#ffffff" fill-opacity=".72">PARTNERSKÝ PROGRAM</text>
    <text x="52" y="277" font-size="46" font-weight="700" letter-spacing="-1">Partnerská karta</text>
    <rect x="40" y="326" width="776" height="169" rx="24" fill="url(#card-glass)" stroke="#ffffff" stroke-opacity=".16"/>
    <path d="M65 327H791" stroke="#ffffff" stroke-opacity=".14"/>
    <text x="68" y="364" font-size="13" letter-spacing="2" fill="#ffffff" fill-opacity=".6">PARTNER</text>
    ${text(input.partnerName, 68, 409, 30, 720, 'font-weight="700"')}
    ${text(input.partnerCode, 68, 465, 24, 580, 'fill="#ffffff" fill-opacity=".8"')}
    <circle cx="771" cy="457" r="6" fill="#0080ff"/>`;
  const back = `
    ${text(input.companyName, 52, 86, 24, 750, 'font-weight="700"')}
    <rect x="40" y="120" width="776" height="334" rx="24" fill="url(#card-glass)" stroke="#ffffff" stroke-opacity=".16"/>
    <rect x="56" y="136" width="302" height="302" rx="16" fill="white"/>
    <image href="${escapeCardText(input.qrPng)}" x="68" y="148" width="278" height="278"/>
    <rect x="396" y="172" width="44" height="4" rx="2" fill="#0080ff"/>
    <text x="396" y="221" font-size="26" font-weight="700">Predložte pri nákupe</text>
    <text x="396" y="259" font-size="16" fill="#ffffff" fill-opacity=".72">QR kód identifikuje partnera.</text>
    <text x="396" y="329" font-size="13" letter-spacing="2" fill="#ffffff" fill-opacity=".6">PARTNERSKÝ KÓD</text>
    ${text(input.partnerCode, 396, 376, 30, 386, 'font-weight="700"')}
    <text x="52" y="496" font-size="14" fill="#ffffff" fill-opacity=".65">Kartu a jej QR kód uchovávajte v bezpečí.</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH_MM}mm" height="${CARD_HEIGHT_MM}mm" viewBox="0 0 856 539.8">
    <defs>
      <radialGradient id="card-blue"><stop stop-color="#0080ff" stop-opacity=".36"/><stop offset="1" stop-color="#0080ff" stop-opacity="0"/></radialGradient>
      <radialGradient id="card-purple"><stop stop-color="#8b00ff" stop-opacity=".28"/><stop offset="1" stop-color="#8b00ff" stop-opacity="0"/></radialGradient>
      <radialGradient id="card-teal"><stop stop-color="#20b2aa" stop-opacity=".12"/><stop offset="1" stop-color="#20b2aa" stop-opacity="0"/></radialGradient>
      <linearGradient id="card-glass" x2="1" y2="1"><stop stop-color="#ffffff" stop-opacity=".09"/><stop offset="1" stop-color="#ffffff" stop-opacity=".025"/></linearGradient>
    </defs>
    <rect width="856" height="539.8" fill="#000000"/>
    <ellipse cx="70" cy="20" rx="590" ry="440" fill="url(#card-blue)"/>
    <ellipse cx="830" cy="100" rx="490" ry="420" fill="url(#card-purple)"/>
    <ellipse cx="540" cy="570" rx="460" ry="260" fill="url(#card-teal)"/>
    <g font-family="DejaVu Sans, Arial, sans-serif" fill="#ffffff">${side === "front" ? front : back}</g>
  </svg>`;
}

export function cardSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
