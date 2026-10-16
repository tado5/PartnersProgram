import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { getPublicCard } from "@/server/public-card";
import { escapeHtml } from "@/lib/html";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return notFound();

  const queryPage = new URL(request.url).searchParams.get("page");
  const page = queryPage === null ? 1 : Number(queryPage);
  if (!Number.isInteger(page) || page < 1 || page > 10000) {
    return new NextResponse(invalidPageHtml(), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const card = await getPublicCard(token, page);
  if (!card) return notFound();
  const html = publicCardHtml(card, token, page);
  return new NextResponse(`<!doctype html>${html}`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function notFound() {
  return new NextResponse(notFoundHtml(), {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const styles = `
  :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #fff; background: #000; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; padding: 2rem 1rem; background: radial-gradient(ellipse at 12% 8%, rgba(0,128,255,.25), transparent 38rem), radial-gradient(ellipse at 88% 18%, rgba(139,0,255,.2), transparent 36rem), radial-gradient(ellipse at 72% 82%, rgba(255,20,147,.14), transparent 38rem), radial-gradient(ellipse at 16% 86%, rgba(32,178,170,.14), transparent 34rem), #000; }
  main { max-width: 48rem; margin: 0 auto; display: grid; gap: 1.25rem; }
  header { border: 1px solid rgba(255,255,255,.2); border-radius: 1rem; background: rgba(255,255,255,.15); color: white; padding: 1.75rem; box-shadow: 0 8px 32px rgba(0,0,0,.18); -webkit-backdrop-filter: blur(15px); backdrop-filter: blur(15px); }
  .brand { color: #0080ff; font-size: .8rem; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
  .company-logo { display: block; max-width: 100%; width: 176px; height: 64px; object-fit: contain; object-position: left; margin-bottom: .75rem; background: white; border-radius: .5rem; padding: .5rem; }
  h1 { margin: .75rem 0 0; overflow-wrap: anywhere; font-size: clamp(1.8rem, 6vw, 2.4rem); }
  h2 { margin: 0; font-size: 1.2rem; }
  p { line-height: 1.5; }
  .muted { color: rgba(255,255,255,.75); font-size: .9rem; }
  header .muted { color: rgba(255,255,255,.9); }
  .badge { display: inline-block; margin-top: 1.2rem; border-radius: 999px; padding: .5rem 1rem; background: #0080ff; color: #000; font-weight: 700; }
  .next { margin: .5rem 0 0; color: rgba(255,255,255,.75); font-size: .9rem; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
  .panel, .summary { border: 1px solid rgba(255,255,255,.12); border-radius: .9rem; background: rgba(0,0,0,.72); color: #fff; padding: 1rem; box-shadow: 0 8px 32px rgba(0,0,0,.18); }
  .summary-label { margin: 0; color: rgba(255,255,255,.75); font-size: .875rem; }
  .summary-value { margin: .25rem 0 0; font-size: 1.45rem; font-weight: 700; }
  .intro { margin: .35rem 0 0; color: rgba(255,255,255,.75); font-size: .9rem; }
  .tiers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .6rem; margin-top: 1rem; }
  .tier { border: 1px solid rgba(255,255,255,.12); border-radius: .7rem; background: rgba(255,255,255,.06); padding: .75rem; }
  .tier-label { display: block; color: rgba(255,255,255,.75); font-size: .8rem; }
  .tier-count { display: block; margin-top: .25rem; font-size: 1.2rem; font-weight: 700; }
  ol { list-style: none; margin: 1rem 0 0; padding: 0; }
  li { display: flex; justify-content: space-between; gap: 1rem; border-top: 1px solid rgba(255,255,255,.1); padding: .8rem 0; }
  .right { text-align: right; }
  .points { font-size: 1.1rem; font-weight: 700; white-space: nowrap; }
  .pagination { display: flex; justify-content: space-between; align-items: center; gap: 1rem; border-top: 1px solid rgba(255,255,255,.1); padding-top: 1rem; font-size: .9rem; }
  a { color: #0080ff; }
  a:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
  footer { color: rgba(255,255,255,.65); text-align: center; font-size: .75rem; }
  .empty { margin: 1rem 0 0; color: rgba(255,255,255,.75); font-size: .9rem; }
  @supports not (backdrop-filter: blur(15px)) { header { background: rgba(0,0,0,.45); } }
  @media (prefers-reduced-transparency: reduce) { header { background: rgba(0,0,0,.75); -webkit-backdrop-filter: none; backdrop-filter: none; } }
  @media (max-width: 35rem) { body { padding: 1rem .75rem; } .grid { gap: .5rem; } .summary { padding: .8rem; } .summary-value { font-size: 1.2rem; } .tiers { gap: .4rem; } .tier { padding: .6rem; } li { align-items: flex-start; flex-direction: column; gap: .25rem; } .right { text-align: left; } }
`;

function publicCardHtml(card: NonNullable<Awaited<ReturnType<typeof getPublicCard>>>, token: string, page: number) {
  const pageCount = Math.max(1, Math.ceil(card.purchases.total / card.purchases.pageSize));
  const badge = card.badge.tier
    ? `<p class="badge">${escapeHtml(card.badge.label ?? "")}</p>${card.badge.nextThreshold ? `<p class="next">Ďalšie ocenenie od ${currency(card.badge.nextThreshold)}</p>` : ""}`
    : `<p class="next">${card.badge.nextThreshold ? `Najbližšie ocenenie od ${currency(card.badge.nextThreshold)}` : "Zatiaľ bez mesačného ocenenia"}</p>`;
  const awards = card.badgeHistory.awards.length
    ? `<ol>${card.badgeHistory.awards.map((award) => `<li><strong>${monthLabel(award.period)} · ${escapeHtml(award.label)}</strong><span class="muted right">${currency(award.monthlyTurnover)} ${award.calculationBasis === "net" ? "bez DPH" : "s DPH (historický výpočet)"} / hranica ${currency(award.threshold)}</span></li>`).join("")}</ol>`
    : `<p class="empty">Zatiaľ nebol uzavretý žiadny mesiac s ocenením.</p>`;
  const purchases = card.purchases.items.length
    ? `<ol>${card.purchases.items.map((purchase) => `<li><div><strong>${currency(purchase.netAmount)} bez DPH</strong><div class="muted">${currency(purchase.grossAmount)} s DPH (${escapeHtml(purchase.vatRatePercent)} %) · ${dateLabel(purchase.date)}</div></div><div class="right"><div class="points">${purchase.points} bodov</div><div class="muted">${purchase.partnerPresent ? "Osobne" : "Neosobne"}</div></div></li>`).join("")}</ol>`
    : `<p class="empty">Zatiaľ tu nie sú žiadne nákupy.</p>`;
  const pagination = pageCount > 1
    ? `<nav class="pagination" aria-label="Stránkovanie nákupov">${page > 1 ? `<a href="/k/${escapeHtml(token)}?page=${page - 1}">Novšie</a>` : "<span></span>"}<span class="muted">Strana ${page} z ${pageCount}</span>${page < pageCount ? `<a href="/k/${escapeHtml(token)}?page=${page + 1}">Staršie</a>` : "<span></span>"}</nav>`
    : "";
  return `<html lang="sk">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${escapeHtml(card.displayName)} · ${escapeHtml(card.companyName)}</title>
    <style>${styles}</style>
  </head>
  <body>
    <main>
      <header>
        ${card.companyLogoUrl ? `<img class="company-logo" src="${escapeHtml(card.companyLogoUrl)}" alt="Logo ${escapeHtml(card.companyName)}">` : ""}
        <div class="brand">${escapeHtml(card.companyName)}</div>
        <h1>${escapeHtml(card.displayName)}</h1>
        <p class="muted">Partnerská karta · ${escapeHtml(card.code)}</p>
        ${badge}
      </header>
      <section class="grid" aria-label="Súhrn partnera">
        ${summaryCard("Body celkom", card.totalPoints.toLocaleString("sk-SK"))}
        ${summaryCard("Obrat celkom bez DPH", currency(card.totalNetAmount))}
        ${summaryCard("Tržba celkom s DPH", currency(card.totalGrossAmount))}
        ${summaryCard("Body tento mesiac", card.monthPoints.toLocaleString("sk-SK"))}
        ${summaryCard("Obrat tento mesiac bez DPH", currency(card.monthNetAmount))}
        ${summaryCard("Tržba tento mesiac s DPH", currency(card.monthGrossAmount))}
      </section>
      <section class="panel">
        <h2>Mesačné ocenenia</h2>
        <p class="intro">Každý partner môže ocenenie získať po dosiahnutí hranice nastavenej firmou.</p>
        <div class="tiers">
          ${tierCount("Bronzový", card.badgeHistory.counts.bronze)}
          ${tierCount("Strieborný", card.badgeHistory.counts.silver)}
          ${tierCount("Zlatý", card.badgeHistory.counts.gold)}
        </div>
        ${awards}
      </section>
      <section class="panel">
        <h2>Nákupy</h2>
        ${purchases}
        ${pagination}
      </section>
      <section class="panel">
        <p class="intro">Odkaz na kartu uchovávajte v súkromí. Osoba s odkazom môže vidieť údaje zobrazené na karte.</p>
        ${card.privacyUrl ? `<p><a href="${escapeHtml(card.privacyUrl)}">Ochrana osobných údajov</a></p>` : ""}
      </section>
      <footer>Partnerský program · ${escapeHtml(new URL(env.APP_BASE_URL).host)}</footer>
    </main>
  </body>
</html>`;
}

function summaryCard(label: string, value: string) {
  return `<div class="summary"><p class="summary-label">${escapeHtml(label)}</p><p class="summary-value">${escapeHtml(value)}</p></div>`;
}

function tierCount(label: string, count: number) {
  return `<div class="tier"><span class="tier-label">${escapeHtml(label)}</span><span class="tier-count">${count} mes.</span></div>`;
}

function notFoundHtml() {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Karta sa nenašla</title><style>${styles}</style></head><body><main><section class="panel"><h1>Karta sa nenašla</h1><p class="intro">Karta nie je dostupná.</p></section></main></body></html>`;
}

function invalidPageHtml() {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Neplatná stránka</title><style>${styles}</style></head><body><main><section class="panel"><h1>Neplatná stránka</h1><p class="intro">Požadovanú stránku nákupov nemožno zobraziť.</p></section></main></body></html>`;
}

function currency(amount: string) {
  return escapeHtml(new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(Number(amount)));
}

function dateLabel(value: string) {
  return escapeHtml(new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium", timeStyle: "short", timeZone: env.APP_TIMEZONE,
  }).format(new Date(value)));
}

function monthLabel(period: string) {
  return escapeHtml(new Intl.DateTimeFormat("sk-SK", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${period}-01T00:00:00.000Z`)));
}
