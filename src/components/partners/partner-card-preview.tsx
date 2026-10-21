"use client";

import Image from "next/image";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { useCompanyApi } from "@/components/company-context";
import { CARD_CORNER_RADIUS_MM, CARD_HEIGHT_MM, CARD_WIDTH_MM, cardSvgDataUrl, renderPartnerCardSvg, type PartnerCardArtwork } from "@/lib/partner-card";
import { formatApiError } from "@/lib/validation-errors";

export function PartnerCardPreview({ artwork, partnerId, token }: {
  artwork: PartnerCardArtwork;
  partnerId: string;
  token: string;
}) {
  const { companyFetch } = useCompanyApi();
  const [pending, setPending] = useState<"card" | "a4" | null>(null);
  const [error, setError] = useState("");

  async function download(format: "card" | "a4") {
    if (pending) return;
    setPending(format);
    setError("");
    try {
      const response = await companyFetch(`/api/partners/${partnerId}/card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, format }),
      });
      if (!response.ok) {
        const body = await response.json();
        setError(formatApiError(body.error, "Kartu sa nepodarilo pripraviť."));
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${artwork.partnerCode}-karta-${format}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("Kartu sa nepodarilo stiahnuť. Skontrolujte pripojenie a skúste to znova.");
    } finally {
      setPending(null);
    }
  }

  return <section aria-label="Náhľad partnerskej karty" className="mt-5 min-w-0">
    <div className="grid min-w-0 gap-5 md:grid-cols-2">
      {(["front", "back"] as const).map((side) => {
        const label = side === "front" ? "Predná strana" : "Zadná strana";
        return <figure key={side} className="min-w-0">
          <figcaption className="mb-2 text-sm font-medium text-stone-700">{label}</figcaption>
          <Image
            alt={`${label} partnerskej karty ${artwork.partnerCode}`}
            src={cardSvgDataUrl(renderPartnerCardSvg(artwork, side))}
            width={856} height={540} unoptimized
            className="h-auto w-full shadow-lg ring-1 ring-white/15"
            style={{ aspectRatio: `${CARD_WIDTH_MM} / ${CARD_HEIGHT_MM}`, borderRadius: `${CARD_CORNER_RADIUS_MM / CARD_WIDTH_MM * 100}% / ${CARD_CORNER_RADIUS_MM / CARD_HEIGHT_MM * 100}%` }}
          />
          <a className="mt-2 inline-block text-xs font-medium text-stone-700"
            download={`${artwork.partnerCode}-${side}.svg`}
            href={cardSvgDataUrl(renderPartnerCardSvg(artwork, side))}>
            Stiahnuť grafiku: {label.toLowerCase()}
          </a>
        </figure>;
      })}
    </div>
    <p className="mt-4 text-sm text-stone-600">
      Štandardný formát plastovej karty ID-1: <strong>85,60 × 53,98 mm</strong> (8,56 × 5,398 cm).
      Náhľad je zväčšený podľa obrazovky, nie v skutočnej veľkosti.
      Náhľad má zaoblené rohy; tlačová grafika vyplní celý rozmer.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={pending !== null} aria-busy={pending === "card"} onClick={() => void download("card")}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
        {pending === "card" ? <Loader2 aria-hidden className="size-4 shrink-0 animate-spin motion-reduce:animate-none" /> : null}
        {pending === "card" ? "Pripravujem PDF karty…" : "PDF karty · 85,60 × 53,98 mm"}
      </button>
      <button type="button" disabled={pending !== null} aria-busy={pending === "a4"} onClick={() => void download("a4")}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">
        {pending === "a4" ? <Loader2 aria-hidden className="size-4 shrink-0 animate-spin motion-reduce:animate-none" /> : null}
        {pending === "a4" ? "Pripravujem PDF na tlač…" : "PDF na tlač · A4"}
      </button>
    </div>
    {pending ? <p role="status" className="mt-3 text-sm text-stone-600">
      Pripravujem PDF, môže to trvať niekoľko sekúnd. Počkajte, sťahovanie sa spustí automaticky.
    </p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    <p className="mt-3 text-xs leading-5 text-stone-600">
      PDF karty má dve strany veľkosti karty, nie A4. PDF na tlač má dve A4 s kartou v skutočnej veľkosti,
      orezovými značkami a kontrolnou mierkou. PDF prehliadač môže stranu automaticky zväčšiť.
      Tlačte ako „Skutočná veľkosť“ / 100 %, nie „Prispôsobiť strane“.
      Pri obojstrannej tlači na výšku použite preklopenie po dlhšej hrane a najprv skúšobný hárok.
      Priama potlač plastu vyžaduje tlačiareň na karty; tlačové PDF zatiaľ nemá spadávku ani CMYK profil.
      Aktívnu kartu môžete znovu otvoriť a stiahnuť v detaile partnera.
    </p>
  </section>;
}
